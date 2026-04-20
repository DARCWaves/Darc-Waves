require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const TIMEOUT = 60000;
const MAX_RETRIES = 3;

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   VALIDAÇÃO DE AMBIENTE
========================= */
function validarConfig() {
  if (!OPENAI_API_KEY || !OPENAI_API_KEY.trim()) {
    throw new Error("OPENAI_API_KEY não configurada");
  }
}

/* =========================
   UTILITÁRIOS
========================= */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function limparJSON(texto) {
  if (!texto) return "";

  let t = String(texto)
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const primeiroColchete = t.indexOf("{");
  const ultimoColchete = t.lastIndexOf("}");

  if (primeiroColchete !== -1 && ultimoColchete !== -1 && ultimoColchete > primeiroColchete) {
    t = t.substring(primeiroColchete, ultimoColchete + 1);
  }

  return t;
}

async function fetchComRetry(url, options, tentativas = MAX_RETRIES) {
  let erroFinal;

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

      const resposta = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const textoCru = await resposta.text();
      let json;

      try {
        json = textoCru ? JSON.parse(textoCru) : {};
      } catch (parseErr) {
        throw new Error(`Resposta não é JSON válido. Conteúdo: ${textoCru}`);
      }

      if (!resposta.ok) {
        throw new Error(`Erro ${resposta.status}: ${JSON.stringify(json)}`);
      }

      return json;
    } catch (erro) {
      erroFinal = erro;
      console.log(`[fetchComRetry] Tentativa ${tentativa}/${tentativas} falhou:`, erro.message);

      if (tentativa < tentativas) {
        await delay(1500 * tentativa);
      }
    }
  }

  throw erroFinal;
}

function normalizarHashtags(hashtags) {
  if (!Array.isArray(hashtags)) return [];

  return hashtags
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((item) => (item.startsWith("#") ? item : `#${item}`))
    .slice(0, 10);
}

function normalizarSlides(slides) {
  if (!Array.isArray(slides)) return [];

  return slides
    .map((slide, index) => ({
      titulo: String(slide?.titulo || `Slide ${index + 1}`).trim(),
      texto: String(slide?.texto || "").trim(),
      promptImagem: String(
        slide?.promptImagem || slide?.imagem || `Imagem profissional do slide ${index + 1}`
      ).trim()
    }))
    .filter((slide) => slide.titulo || slide.texto || slide.promptImagem)
    .slice(0, 6);
}

/* =========================
   HOME
========================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* =========================
   HEALTHCHECK
========================= */
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    status: "online",
    timestamp: new Date().toISOString()
  });
});

/* =========================
   GERAR CONTEÚDO
========================= */
app.get("/gerar-conteudo", async (req, res) => {
  try {
    validarConfig();

    const tema = String(req.query.tema || "").trim();

    if (!tema || tema.length < 3) {
      return res.json({
        ok: false,
        erro: "Tema inválido",
        detalhes: "Informe um tema com pelo menos 3 caracteres."
      });
    }

    const prompt = `
Crie um carrossel sobre: "${tema}"

RETORNE APENAS JSON VÁLIDO.

PROIBIDO:
- markdown
- explicações
- comentários
- texto fora do JSON
- bloco de código

Formato obrigatório:
{
  "texto": "Legenda completa e persuasiva",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4"],
  "slides": [
    {
      "titulo": "Título do slide 1",
      "texto": "Texto curto do slide 1",
      "promptImagem": "Descrição visual detalhada da imagem do slide 1"
    },
    {
      "titulo": "Título do slide 2",
      "texto": "Texto curto do slide 2",
      "promptImagem": "Descrição visual detalhada da imagem do slide 2"
    },
    {
      "titulo": "Título do slide 3",
      "texto": "Texto curto do slide 3",
      "promptImagem": "Descrição visual detalhada da imagem do slide 3"
    },
    {
      "titulo": "Título do slide 4",
      "texto": "Texto curto do slide 4",
      "promptImagem": "Descrição visual detalhada da imagem do slide 4"
    },
    {
      "titulo": "Título do slide 5",
      "texto": "Texto curto do slide 5",
      "promptImagem": "Descrição visual detalhada da imagem do slide 5"
    },
    {
      "titulo": "Título do slide 6",
      "texto": "Texto curto do slide 6",
      "promptImagem": "Descrição visual detalhada da imagem do slide 6"
    }
  ]
}

Regras:
- 6 slides obrigatórios
- slide 1 deve ser uma capa chamativa
- slides 2 a 6 devem aprofundar o mesmo tema
- conteúdo em português do Brasil
- hashtags fortes e naturais
- promptImagem deve ser bem visual e útil para gerar imagem
`;

    const data = await fetchComRetry(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "Você é um gerador profissional de carrosséis para redes sociais. Quando for pedido JSON, responda apenas JSON válido."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.7
        })
      }
    );

    const texto = data?.choices?.[0]?.message?.content;

    if (!texto) {
      throw new Error("Resposta vazia da OpenAI para conteúdo");
    }

    const textoLimpo = limparJSON(texto);

    let json;
    try {
      json = JSON.parse(textoLimpo);
    } catch (err) {
      console.log("========== DEBUG CONTEÚDO ==========");
      console.log("RESPOSTA ORIGINAL:\n", texto);
      console.log("RESPOSTA LIMPA:\n", textoLimpo);
      console.log("====================================");
      throw new Error("JSON inválido retornado pela OpenAI");
    }

    const slides = normalizarSlides(json.slides);
    const hashtags = normalizarHashtags(json.hashtags);
    const legenda = String(json.texto || "").trim();

    if (!slides.length) {
      throw new Error("Nenhum slide foi retornado pela IA");
    }

    res.json({
      ok: true,
      texto: legenda,
      hashtags,
      slides
    });
  } catch (err) {
    console.log("Erro conteúdo:", err.message);

    res.json({
      ok: false,
      erro: "Erro ao gerar conteúdo",
      detalhes: err.message || "erro desconhecido"
    });
  }
});

/* =========================
   GERAR IMAGEM
========================= */
app.get("/gerar-imagem", async (req, res) => {
  try {
    validarConfig();

    const prompt = String(req.query.prompt || "").trim();
    const titulo = String(req.query.titulo || "").trim();
    const texto = String(req.query.texto || "").trim();
    const tema = String(req.query.tema || "").trim();

    if (!prompt) {
      return res.json({
        ok: false,
        erro: "Prompt inválido",
        detalhes: "Nenhum prompt de imagem foi informado."
      });
    }

    const promptFinal = `
Crie uma imagem profissional para um carrossel de Instagram.

Tema geral:
${tema || "conteúdo para redes sociais"}

Título do slide:
${titulo || "sem título"}

Texto do slide:
${texto || "sem texto"}

Direção visual:
${prompt}

Regras obrigatórias:
- sem texto escrito dentro da imagem
- sem marca d'água
- sem logo
- visual moderno
- alta qualidade
- composição bonita
- imagem quadrada
- adequada para marketing e redes sociais
`;

    const data = await fetchComRetry(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt: promptFinal,
          size: "1024x1024"
        })
      }
    );

    const imagemBase64 = data?.data?.[0]?.b64_json;

    if (!imagemBase64) {
      throw new Error("Imagem não gerada pela OpenAI");
    }

    res.json({
      ok: true,
      imagem: `data:image/png;base64,${imagemBase64}`
    });
  } catch (err) {
    console.log("Erro imagem:", err.message);

    res.json({
      ok: false,
      erro: "Erro ao gerar imagem",
      detalhes: err.message || "erro desconhecido"
    });
  }
});

/* =========================
   ROTA NÃO ENCONTRADA
========================= */
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    erro: "Rota não encontrada",
    detalhes: `${req.method} ${req.originalUrl}`
  });
});

/* =========================
   ERRO GLOBAL
========================= */
app.use((err, req, res, next) => {
  console.log("Erro global:", err.message);

  res.status(500).json({
    ok: false,
    erro: "Erro interno do servidor",
    detalhes: err.message || "erro desconhecido"
  });
});

/* =========================
   START
========================= */
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
