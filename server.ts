import "dotenv/config";
import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

function getAIClient(customKey?: string): GoogleGenAI {
  const key = customKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

async function generateContentWithRetry(ai: GoogleGenAI, params: any) {
  const models = [
    params.model || "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-1.5-flash",
    "gemini-2.5-flash-lite"
  ];
  let lastError: any = null;

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await ai.models.generateContent({
          ...params,
          model
        });
        return res;
      } catch (err: any) {
        lastError = err;
        console.warn(`Gemini attempt failed for model ${model} (attempt ${attempt + 1}):`, err?.message || err);
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

// Helper to execute core API logic for both Express and Cloudflare Workers
async function processApiRequest(pathname: string, body: any, apiKey?: string) {
  const ai = getAIClient(apiKey);

  if (pathname === '/api/gemini/generate-text') {
    const { prompt, systemInstruction } = body;
    const config: any = {};
    if (systemInstruction) {
      config.systemInstruction = systemInstruction;
    }
    const response = await generateContentWithRetry(ai, {
      contents: prompt,
      config
    });
    return { text: response.text || "" };
  }

  if (pathname === '/api/gemini/scan-image') {
    const { base64Image, prompt } = body;
    if (!base64Image) {
      throw new Error("base64Image is required");
    }
    let mimeType = "image/jpeg";
    let rawData = base64Image;
    if (base64Image.includes(";base64,")) {
      const parts = base64Image.split(";base64,");
      const match = parts[0].match(/data:(.*)/);
      if (match && match[1]) {
        mimeType = match[1];
      }
      rawData = parts[1];
    } else if (base64Image.includes(",")) {
      rawData = base64Image.split(",")[1];
    }

    const imagePart = {
      inlineData: {
        mimeType,
        data: rawData
      }
    };
    const textPart = {
      text: prompt || "Identify all distinct store products visible in this image. Return a JSON array."
    };
    
    const response = await generateContentWithRetry(ai, {
      contents: { parts: [imagePart, textPart] }
    });
    
    return { text: response.text || "[]" };
  }

  if (pathname === '/api/gemini/detect-columns') {
    const { sampleData } = body;
    const response = await generateContentWithRetry(ai, {
      contents: `Map these columns: ${Object.keys(sampleData?.[0] || {}).join(', ')} to 'name', 'stock', 'costPrice', 'expiryDate'. Return ONLY the JSON mapping object.`,
    });
    return { text: response.text || "{}" };
  }

  if (pathname === '/api/gemini/voice-transcript') {
    const { transcript, systemInstruction } = body;
    const config: any = {};
    if (systemInstruction) {
      config.systemInstruction = systemInstruction;
    }
    const response = await generateContentWithRetry(ai, {
      contents: transcript,
      config
    });
    return { text: response.text || "" };
  }

  throw new Error("API endpoint not found");
}

// Cloudflare Worker handler
export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    if (url.pathname.startsWith('/api/')) {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      try {
        const body = await request.json();
        const result = await processApiRequest(url.pathname, body, apiKey);
        return Response.json(result);
      } catch (error: any) {
        console.error("Cloudflare Worker API error:", error);
        return Response.json({ error: error.message || "Internal server error" }, { status: 500 });
      }
    }

    // Serve static assets on Cloudflare if ASSETS binding exists
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  }
};

// Express Server for Node.js / Cloud Run / AI Studio preview
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // API endpoints for Express
  app.post("/api/gemini/*", async (req, res) => {
    try {
      const result = await processApiRequest(req.path, req.body);
      res.json(result);
    } catch (error: any) {
      console.error(`Server API error (${req.path}):`, error);
      res.status(500).json({ error: error.message || "Failed to process request" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false 
      },
      appType: "spa",
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api/')) {
        return next();
      }
      try {
        const fs = await import('fs/promises');
        let html = await fs.readFile(path.join(process.cwd(), 'index.html'), 'utf-8');
        html = await vite.transformIndexHtml(req.originalUrl, html);
        res.status(200).set({ 'Content-Type': 'text/html' }).send(html);
      } catch (e: any) {
        if (vite.ssrFixStacktrace) {
          vite.ssrFixStacktrace(e);
        }
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Start Express server when running in Node.js (not as a Cloudflare Worker)
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production' && !process.env.CF_PAGES && !process.env.CLOUDFLARE_WORKERS) {
  startServer();
} else if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production' && !process.env.CF_PAGES) {
  startServer();
}
