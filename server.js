require("dotenv").config();

const express = require("express");
const axios = require("axios");
const path = require("path");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const GEMINI_IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image-preview";

const REQUEST_TIMEOUT_MS = 120000;
const MAX_SLIDES = 6;
const MAX_HASHTAGS = 10;

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

function logInfo(...args) {
  console.log("[INFO]", ...args);
}

function logWarn(...args) {
  console.warn("[WARN]", ...args);
}

function logError(...args) {
  console.error("[ERROR]", ...args);
}

function validarConfig() {
  const erros = [];

  if (!OPENAI_API_KEY.trim()) {
    erros.push("OPENAI_API_KEY não configurada");
  }

  if (!GEMINI_API_KEY.trim()) {
    erros.push("GEMINI_API_KEY não configurada");
  }

  if (!Number.isFinite(PORT) || PORT <= 0) {
    erros.push("PORT inválida");
  }

  if (erros.length > 0) {
    throw new Error(erros.join(" | "));
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function safeString(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value);
}

function limitarTexto(texto, tamanhoMaximo = 4000) {
  const valor = safeString(texto, "").trim();

  if (valor.length <= tamanhoMaximo) {
    return valor;
  }

  return valor.slice(0, tamanhoMaximo);
}

function limparJSON(texto) {
  let textoLimpo = safeString(texto, "").trim();

  if (!textoLimpo) {
    return "";
  }

  textoLimpo = textoLimpo
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const primeiroObjeto = textoLimpo.indexOf("{");
  const ultimoObjeto = textoLimpo.lastIndexOf("}");

  if (primeiroObjeto !== -1 && ultimoObjeto !== -1 && ultimoObjeto > primeiroObjeto) {
    textoLimpo = textoLimpo.slice(primeiroObjeto, ultimoObjeto + 1);
  }

  return textoLimpo.trim();
}

function garantirArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizarHashtags(lista) {
  const hashtags = garantirArray(lista)
    .map((item) => safeString(item, "").trim())
    .filter(Boolean)
    .map((item) => (item.startsWith("#") ? item : `#${item}`))
    .slice(0, MAX_HASHTAGS);

  return hashtags;
}

function normalizarSlides(slides) {
  return garantirArray(slides)
    .slice(0, MAX_SLIDES)
    .map((slide, index) => {
      const titulo = limitarTexto(slide?.titulo || `Slide ${index + 1}`, 120);
      const texto = limitarTexto(slide?.texto || "", 500);
      const promptImagem = limitarTexto(
        slide?.promptImagem || slide?.imagem || `Imagem profissional sobre o slide ${index + 1}`,
        1400
      );

      return {
        id: index + 1,
        titulo,
        texto,
        promptImagem
      };
    });
}

function validarEstruturaConteudo(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Resposta de conteúdo inválida");
  }

  const texto = limitarTexto(data.texto || "", 5000);
  const hashtags = normalizarHashtags(data.hashtags || []);
  const slides = normalizarSlides(data.slides || []);

  if (!texto) {
    throw new Error("Texto principal não foi retornado");
  }

  if (!slides.length) {
    throw new Error("Nenhum slide válido foi retornado");
  }

  return {
    texto,
    hashtags,
    slides
  };
}

function criarAxiosConfig(headers = {}, timeout = REQUEST_TIMEOUT_MS) {
  return {
    headers,
    timeout,
    validateStatus: () => true
  };
}

async function chamarOpenAIChat(prompt) {
  const url = "https://api.openai.com/v1/chat/completions";

  const payload = {
    model: OPENAI_MODEL,
    messages: [
      {
        role: "system",
        content:
          "Você é um gerador de conteúdo para carrossel de redes sociais. Responda sempre em JSON válido quando solicitado."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.9
  };

  const response = await axios.post(
    url,
    payload,
    criarAxiosConfig({
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    })
  );

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `OpenAI retornou status ${response.status}: ${JSON.stringify(response.data)}`
    );
  }

  const content = response?.data?.choices?.[0]?.message?.content;

  if (!isNonEmptyString(content)) {
    throw new Error("OpenAI não retornou texto válido");
  }

  return content;
}

async function gerarConteudoComOpenAI(tema, modo = "normal") {
  const temaSeguro = limitarTexto(tema, 300);

  const prompt = `
Crie um conteúdo para redes sociais sobre: "${temaSeguro}".

Objetivo:
- gerar 1 legenda completa e persuasiva
- gerar 4 hashtags fortes
- gerar 6 slides coerentes sobre o MESMO assunto

Regras:
- o slide 1 deve ser uma capa forte e chamativa
- os slides 2 a 6 devem aprofundar o mesmo conteúdo
- cada slide precisa de:
  - titulo
  - texto curto
  - promptImagem (descrição visual extremamente clara da imagem)
- a resposta deve ser SOMENTE em JSON válido
- não use markdown
- não use blocos de código
- o texto deve ser em português do Brasil
- o modo atual é: "${modo}"

Formato obrigatório:
{
  "texto": "Legenda completa, envolvente e persuasiva",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4"],
  "slides": [
    {
      "titulo": "Título do slide 1",
      "texto": "Texto curto do slide 1",
      "promptImagem": "Descrição visual clara e detalhada da imagem do slide 1"
    },
    {
      "titulo": "Título do slide 2",
      "texto": "Texto curto do slide 2",
      "promptImagem": "Descrição visual clara e detalhada da imagem do slide 2"
    },
    {
      "titulo": "Título do slide 3",
      "texto": "Texto curto do slide 3",
      "promptImagem": "Descrição visual clara e detalhada da imagem do slide 3"
    },
    {
      "titulo": "Título do slide 4",
      "texto": "Texto curto do slide 4",
      "promptImagem": "Descrição visual clara e detalhada da imagem do slide 4"
    },
    {
      "titulo": "Título do slide 5",
      "texto": "Texto curto do slide 5",
      "promptImagem": "Descrição visual clara e detalhada da imagem do slide 5"
    },
    {
      "titulo": "Título do slide 6",
      "texto": "Texto curto do slide 6",
      "promptImagem": "Descrição visual clara e detalhada da imagem do slide 6"
    }
  ]
}
`;

  const respostaBruta = await chamarOpenAIChat(prompt);
  const jsonLimpo = limparJSON(respostaBruta);

  if (!jsonLimpo) {
    throw new Error("A OpenAI retornou conteúdo vazio");
  }

  let data;
  try {
    data = JSON.parse(jsonLimpo);
  } catch (error) {
    logError("Falha ao converter JSON da OpenAI:", respostaBruta);
    throw new Error("A OpenAI retornou JSON inválido");
  }

  return validarEstruturaConteudo(data);
}

function extrairTextoGemini(data) {
  const parts = data?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return "";
  }

  const textos = parts
    .map((part) => {
      if (typeof part?.text === "string") {
        return part.text;
      }
      return "";
    })
    .filter(Boolean);

  return textos.join("\n").trim();
}

function extrairImagemBase64Gemini(data) {
  const parts = data?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return "";
  }

  for (const part of parts) {
    const inlineData = part?.inlineData || part?.inline_data;

    if (
      inlineData &&
      typeof inlineData?.data === "string" &&
      typeof inlineData?.mimeType === "string"
    ) {
      return `data:${inlineData.mimeType};base64,${inlineData.data}`;
    }
  }

  return "";
}

async function chamarGeminiImagem(promptFinal) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      GEMINI_IMAGE_MODEL
    )}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const payload = {
    contents: [
      {
        parts: [
          {
            text: promptFinal
          }
        ]
      }
    ],
    generationConfig: {
      responseModalities: ["IMAGE"]
    }
  };

  const response = await axios.post(
    url,
    payload,
    criarAxiosConfig({
      "Content-Type": "application/json"
    })
  );

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Gemini retornou status ${response.status}: ${JSON.stringify(response.data)}`
    );
  }

  const imagemBase64 = extrairImagemBase64Gemini(response.data);

  if (!imagemBase64) {
    const textoAuxiliar = extrairTextoGemini(response.data);
    throw new Error(
      `Gemini não retornou imagem. Detalhe: ${textoAuxiliar || "sem detalhe adicional"}`
    );
  }

  return imagemBase64;
}

async function gerarImagemGeminiComRetry(promptFinal, tentativas = 3) {
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      const imagem = await chamarGeminiImagem(promptFinal);

      if (!isNonEmptyString(imagem)) {
        throw new Error("Gemini retornou uma imagem vazia");
      }

      return imagem;
    } catch (erro) {
      ultimoErro = erro;
      logWarn(`Tentativa ${tentativa}/${tentativas} de gerar imagem falhou:`, erro.message);

      const deveTentarNovamente = tentativa < tentativas;

      if (!deveTentarNovamente) {
        break;
      }

      await delay(1500 * tentativa);
    }
  }

  throw new Error(
    `Não foi possível gerar a imagem após ${tentativas} tentativas. Último erro: ${
      ultimoErro?.message || "erro desconhecido"
    }`
  );
}

function montarPromptFinalImagem({ tema, titulo, texto, promptBase }) {
  const temaSeguro = limitarTexto(tema, 250);
  const tituloSeguro = limitarTexto(titulo, 180);
  const textoSeguro = limitarTexto(texto, 500);
  const promptSeguro = limitarTexto(promptBase, 1500);

  return `
Crie uma imagem quadrada 1:1 altamente coerente com este slide de carrossel.

Tema geral:
${temaSeguro}

Título do slide:
${tituloSeguro}

Texto do slide:
${textoSeguro}

Direção visual principal:
${promptSeguro}

Regras obrigatórias:
- imagem bonita e profissional
- visual premium
- composição moderna
- pensada para carrossel de Instagram
- coerente com o conteúdo do slide
- sem letras
- sem texto escrito dentro da imagem
- sem marcas d'água
- sem logos
- foco visual claro
- iluminação agradável
- qualidade alta
`.trim();
}

function respostaJsonOk(res, payload = {}) {
  return res.json({
    ok: true,
    ...payload
  });
}

function respostaJsonErro(res, statusCode, mensagem, detalhes = null) {
  return res.status(statusCode).json({
    ok: false,
    erro: mensagem,
    detalhes
  });
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/health", (req, res) => {
  respostaJsonOk(res, {
    status: "healthy",
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

app.get("/teste", (req, res) => {
  respostaJsonOk(res, {
    mensagem: "Servidor funcionando corretamente"
  });
});

app.get("/gerar-conteudo", async (req, res) => {
  try {
    validarConfig();

    const tema = safeString(req.query.tema, "").trim();
    const modo = safeString(req.query.modo, "normal").trim() || "normal";

    if (!isNonEmptyString(tema)) {
      return respostaJsonErro(res, 400, "Tema não informado");
    }

    if (tema.length < 3) {
      return respostaJsonErro(res, 400, "Tema muito curto");
    }

    logInfo("Gerando conteúdo para tema:", tema, "| modo:", modo);

    const conteudo = await gerarConteudoComOpenAI(tema, modo);

    return respostaJsonOk(res, {
      tema,
      texto: conteudo.texto,
      hashtags: conteudo.hashtags,
      slides: conteudo.slides
    });
  } catch (erro) {
    logError("Erro na rota /gerar-conteudo:", erro?.message || erro);

    return respostaJsonErro(
      res,
      500,
      "Erro ao gerar conteúdo",
      erro?.message || "erro desconhecido"
    );
  }
});

app.get("/gerar-imagem", async (req, res) => {
  try {
    validarConfig();

    const promptBase = safeString(req.query.prompt, "").trim();
    const titulo = safeString(req.query.titulo, "").trim();
    const texto = safeString(req.query.texto, "").trim();
    const tema = safeString(req.query.tema, "").trim();

    if (!isNonEmptyString(promptBase)) {
      return respostaJsonErro(res, 400, "Prompt da imagem não informado");
    }

    const promptFinal = montarPromptFinalImagem({
      tema,
      titulo,
      texto,
      promptBase
    });

    logInfo("Gerando imagem para slide:", titulo || "[sem título]");

    const imagem = await gerarImagemGeminiComRetry(promptFinal, 3);

    return respostaJsonOk(res, {
      imagem
    });
  } catch (erro) {
    logError("Erro na rota /gerar-imagem:", erro?.message || erro);

    return respostaJsonErro(
      res,
      500,
      "Erro ao gerar imagem",
      erro?.message || "erro desconhecido"
    );
  }
});

app.use((req, res, next) => {
  const inicio = Date.now();

  res.on("finish", () => {
    const duracao = Date.now() - inicio;

    logInfo(
      `${req.method} ${req.originalUrl} -> ${res.statusCode} (${duracao}ms)`
    );
  });

  next();
});

app.use((req, res) => {
  respostaJsonErro(res, 404, "Rota não encontrada", {
    rota: req.originalUrl,
    metodo: req.method
  });
});

app.use((err, req, res, next) => {
  logError("Erro não tratado no Express:", err?.stack || err);

  if (res.headersSent) {
    return next(err);
  }

  respostaJsonErro(
    res,
    500,
    "Erro interno do servidor",
    err?.message || "erro desconhecido"
  );
});

function iniciarServidor() {
  try {
    validarConfig();

    app.listen(PORT, () => {
      logInfo(`Servidor rodando na porta ${PORT}`);
    });
  } catch (erro) {
    logError("Falha ao iniciar servidor:", erro?.message || erro);
    process.exit(1);
  }
}

process.on("uncaughtException", (erro) => {
  logError("uncaughtException capturada:", erro?.stack || erro);
});

process.on("unhandledRejection", (motivo) => {
  logError("unhandledRejection capturada:", motivo);
});

process.on("SIGINT", () => {
  logWarn("Recebido SIGINT. Encerrando servidor...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logWarn("Recebido SIGTERM. Encerrando servidor...");
  process.exit(0);
});

function validarAmbienteRuntime() {
  const avisos = [];

  if (!OPENAI_API_KEY) {
    avisos.push("OPENAI_API_KEY ausente");
  }

  if (!GEMINI_API_KEY) {
    avisos.push("GEMINI_API_KEY ausente");
  }

  if (avisos.length > 0) {
    logWarn("Avisos de configuração:", avisos.join(" | "));
  }
}

function bootstrap() {
  logInfo("Inicializando aplicação...");
  validarAmbienteRuntime();
  iniciarServidor();
}

bootstrap();
