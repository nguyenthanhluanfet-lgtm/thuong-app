import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  extractHanoiDistrictFallbackQuery,
  HANOI_VIEWBOX,
  isValidHanoiCoordinate,
  normalizeHanoiSearchAddress,
  resolveHanoiDistrictFallback,
} from './src/utils/hanoiGeocode.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

interface ParsedOrder {
  ten_khach: string;
  sdt: string;
  dia_chi: string;
  dia_chi_tim_map?: string;
  ghi_chu: string;
  cum_khu_vuc: string;
  lat?: number;
  lng?: number;
}

function sanitizeParsedOrders(rawItems: unknown): ParsedOrder[] {
  if (!Array.isArray(rawItems)) {
    return [];
  }
  return rawItems
    .map((item, idx): ParsedOrder | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const record = item as Record<string, unknown>;
      const ten_khach = String(record.ten_khach ?? '').trim() || 'Khách hàng';
      const sdt = String(record.sdt ?? '').trim();
      const dia_chi = String(record.dia_chi ?? '').trim();
      const rawMapAddr = String(record.dia_chi_tim_map ?? '').trim();
      const ghi_chu = String(record.ghi_chu ?? '').trim();
      const cum_khu_vuc = String(record.cum_khu_vuc ?? '').trim() || 'Khu vực chung';

      if (!dia_chi && !sdt && !record.ten_khach) {
        return null;
      }

      const finalDiaChi = dia_chi || 'Chưa rõ địa chỉ';
      const dia_chi_tim_map = normalizeHanoiSearchAddress(finalDiaChi, rawMapAddr);

      const lat = typeof record.lat === 'number' ? record.lat : Number(record.lat);
      const lng = typeof record.lng === 'number' ? record.lng : Number(record.lng);
      const hasHanoiCoords = isValidHanoiCoordinate(lat, lng);
      const fallback = hasHanoiCoords
        ? { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) }
        : resolveHanoiDistrictFallback(`${dia_chi_tim_map} ${finalDiaChi}`, `${ten_khach}-${idx}`);

      return {
        ten_khach,
        sdt,
        dia_chi: finalDiaChi,
        dia_chi_tim_map,
        ghi_chu,
        cum_khu_vuc,
        lat: fallback.lat,
        lng: fallback.lng,
      };
    })
    .filter((entry): entry is ParsedOrder => entry !== null);
}

async function queryNominatimHanoi(
  queryStr: string,
  signal: AbortSignal
): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=vn&viewbox=${HANOI_VIEWBOX}&bounded=1&q=${encodeURIComponent(
    queryStr
  )}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'ShipFlow-Dispatch/1.0 (https://quan-ly-shipper.firebaseapp.com)',
      'Accept-Language': 'vi,en',
    },
    signal,
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ lat?: string; lon?: string }>;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const lat = Number(rows[0].lat);
  const lng = Number(rows[0].lon);
  // Strict Hanoi bounding box check: reject any result outside [20.85..21.25, 105.60..106.05]
  if (!isValidHanoiCoordinate(lat, lng)) return null;
  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
}

async function geocodeHanoiAddress(
  rawAddress: string,
  aiSearchAddr?: string,
  timeoutMs = 2800,
  seed?: string
): Promise<{ lat: number; lng: number }> {
  const primaryQuery = normalizeHanoiSearchAddress(rawAddress, aiSearchAddr);
  const districtQuery = extractHanoiDistrictFallbackQuery(rawAddress, primaryQuery);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Pass 1: Bounded Hanoi search with clean street + ", Hà Nội, Việt Nam"
    const hit1 = await queryNominatimHanoi(primaryQuery, controller.signal).catch(() => null);
    if (hit1) return hit1;

    // Pass 2: Fallback to District/Ward + ", Hà Nội, Việt Nam" inside Hanoi viewbox
    if (!controller.signal.aborted && districtQuery && districtQuery !== primaryQuery) {
      const hit2 = await queryNominatimHanoi(districtQuery, controller.signal).catch(() => null);
      if (hit2) return hit2;
    }
  } finally {
    clearTimeout(timer);
  }

  // Pass 3: Instant Hanoi district dictionary fallback with ±0.002 jitter
  const dictFallback = resolveHanoiDistrictFallback(`${primaryQuery} ${rawAddress}`, seed);
  return { lat: dictFallback.lat, lng: dictFallback.lng };
}

async function enrichOrdersWithNominatim(
  orders: ParsedOrder[],
  totalBudgetMs = 3500
): Promise<ParsedOrder[]> {
  if (orders.length === 0) return orders;

  const enriched = await Promise.all(
    orders.map(async (order, idx) => {
      const osmCoords = await geocodeHanoiAddress(
        order.dia_chi,
        order.dia_chi_tim_map,
        totalBudgetMs,
        `${order.ten_khach}-${idx}-${order.dia_chi}`
      ).catch(() => null);

      if (osmCoords && isValidHanoiCoordinate(osmCoords.lat, osmCoords.lng)) {
        return {
          ...order,
          lat: osmCoords.lat,
          lng: osmCoords.lng,
        };
      }

      const fallback = resolveHanoiDistrictFallback(
        `${order.dia_chi_tim_map ?? ''} ${order.dia_chi}`,
        `${order.ten_khach}-${idx}`
      );
      return {
        ...order,
        lat: fallback.lat,
        lng: fallback.lng,
      };
    })
  );

  return enriched;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.post('/api/geocode', async (req, res) => {
    try {
      const { address } = req.body ?? {};
      if (typeof address !== 'string' || !address.trim()) {
        return res.status(400).json({ error: 'Vui lòng cung cấp địa chỉ.' });
      }
      const coords = await geocodeHanoiAddress(address, undefined, 3500, address);
      return res.json(coords);
    } catch {
      const fallback = resolveHanoiDistrictFallback(String(req.body?.address ?? ''));
      return res.json({ lat: fallback.lat, lng: fallback.lng });
    }
  });

  app.post('/api/parse-orders', async (req, res) => {
    try {
      const { rawText } = req.body ?? {};
      if (typeof rawText !== 'string' || !rawText.trim()) {
        return res.status(400).json({
          error: 'Vui lòng dán nội dung tin nhắn đơn hàng từ Zalo trước khi phân tích.',
        });
      }

      const apiKey = process.env.GEMINI_API_KEY?.trim() || '';
      if (!apiKey) {
        return res.status(500).json({
          error:
            'Chưa cấu hình GEMINI_API_KEY trên máy chủ. Vui lòng kiểm tra mục Settings > Secrets.',
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const shortSystemInstruction =
        'Trích xuất đơn hàng từ tin nhắn Zalo tại Hà Nội thành mảng JSON gồm: ten_khach, sdt, dia_chi (giữ nguyên địa chỉ khách), dia_chi_tim_map (xóa số nhà, số ngõ/ngách, số phòng/tầng, tên tòa nhà; vd "ngõ 1194 đường Láng" -> "Đường Láng, Đống Đa, Hà Nội, Việt Nam"; "tòa HH2B Linh Đàm" -> "Bán đảo Linh Đàm, Hoàng Mai, Hà Nội, Việt Nam"; luôn thêm ", Hà Nội, Việt Nam" ở cuối), ghi_chu, cum_khu_vuc, lat, lng (tọa độ chính xác trong khung Hà Nội 20.85..21.25, 105.60..106.05). Không giải thích thêm.';

      const schemaConfig = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            ten_khach: { type: Type.STRING },
            sdt: { type: Type.STRING },
            dia_chi: { type: Type.STRING },
            dia_chi_tim_map: { type: Type.STRING },
            ghi_chu: { type: Type.STRING },
            cum_khu_vuc: { type: Type.STRING },
            lat: { type: Type.NUMBER },
            lng: { type: Type.NUMBER },
          },
          required: [
            'ten_khach',
            'sdt',
            'dia_chi',
            'dia_chi_tim_map',
            'ghi_chu',
            'cum_khu_vuc',
            'lat',
            'lng',
          ],
        },
      };

      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), 11000);

      let response: Awaited<ReturnType<typeof ai.models.generateContent>> | undefined;
      try {
        try {
          response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: rawText.trim(),
            config: {
              abortSignal: controller.signal,
              thinkingConfig: {
                thinkingLevel: ThinkingLevel.MINIMAL,
              },
              systemInstruction: shortSystemInstruction,
              responseMimeType: 'application/json',
              responseSchema: schemaConfig,
            },
          });
        } catch (primaryErr) {
          if (controller.signal.aborted) {
            throw primaryErr;
          }
          const primaryMsg = primaryErr instanceof Error ? primaryErr.message : '';
          const shouldFallback =
            primaryMsg.includes('404') ||
            primaryMsg.includes('NOT_FOUND') ||
            primaryMsg.includes('503') ||
            primaryMsg.includes('UNAVAILABLE');
          if (!shouldFallback) {
            throw primaryErr;
          }
          response = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: rawText.trim(),
            config: {
              abortSignal: controller.signal,
              thinkingConfig: {
                thinkingLevel: ThinkingLevel.LOW,
              },
              systemInstruction: shortSystemInstruction,
              responseMimeType: 'application/json',
              responseSchema: schemaConfig,
            },
          });
        }
      } finally {
        clearTimeout(timeoutHandle);
      }

      const rawJson = (response?.text ?? '[]').trim();
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawJson);
      } catch {
        return res.status(502).json({
          error: 'Phản hồi từ Gemini AI không đúng định dạng JSON. Vui lòng thử lại.',
        });
      }

      const baseOrders = sanitizeParsedOrders(parsed);
      if (baseOrders.length === 0) {
        return res.status(422).json({
          error: 'AI không tìm thấy đơn hàng hợp lệ nào trong đoạn tin nhắn vừa dán.',
        });
      }

      // Enrich/verify street-level coordinates via Nominatim OpenStreetMap in parallel (bounded 3.5s)
      const orders = await enrichOrdersWithNominatim(baseOrders, 3500);

      return res.json({ orders });
    } catch (err: unknown) {
      const isAbort =
        (err instanceof Error && err.name === 'AbortError') ||
        (err instanceof Error && err.message.toLowerCase().includes('aborted'));
      if (isAbort) {
        return res.status(504).json({
          error: 'Yêu cầu phân tích AI vượt quá giới hạn 15 giây (Timeout). Vui lòng thử lại.',
        });
      }

      const message = err instanceof Error ? err.message : 'Lỗi không xác định khi gọi Gemini AI.';
      const status =
        message.includes('API_KEY_INVALID') || message.includes('400')
          ? 400
          : message.includes('PERMISSION_DENIED') || message.includes('403')
            ? 403
            : message.includes('RESOURCE_EXHAUSTED') || message.includes('429')
              ? 429
              : message.includes('503') || message.includes('UNAVAILABLE')
                ? 503
                : 500;

      return res.status(status).json({
        error:
          status === 400 || status === 403
            ? 'Gemini API Key trên máy chủ không hợp lệ hoặc chưa được cấp quyền. Vui lòng kiểm tra Settings > Secrets.'
            : status === 429
              ? 'Gemini API đã vượt giới hạn lượt gọi (429). Vui lòng đợi một lát rồi thử lại.'
              : status === 503
                ? 'Máy chủ Gemini AI đang quá tải tạm thời (503). Vui lòng thử lại sau vài giây.'
                : `Lỗi xử lý AI: ${message}`,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
