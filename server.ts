import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Proxy for Notion
  // To bypass CORS and handle requests securely if needed
  app.post("/api/notion/sync", async (req, res) => {
    const { token, dbId, data } = req.body;
    
    if (!token || !dbId) {
      return res.status(400).json({ error: "Missing Notion configuration" });
    }

    try {
      // Logic to sync with Notion would go here
      // const response = await fetch('https://api.notion.com/v1/pages', { ... });
      res.json({ status: "success", message: "Mock sync success" });
    } catch (error) {
      res.status(500).json({ error: "Failed to sync with Notion" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
