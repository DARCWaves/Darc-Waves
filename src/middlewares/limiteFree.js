const limitePorIP = {};

const LIMITE = 5;

module.exports = function limitarUso(req, res, next) {
  const ip =
    req.headers['x-forwarded-for'] ||
    req.connection.remoteAddress ||
    "desconhecido";

  if (!limitePorIP[ip]) {
    limitePorIP[ip] = 0;
  }

  if (limitePorIP[ip] >= LIMITE) {
    return res.status(403).json({
      ok: false,
      erro: "Limite gratuito atingido",
      detalhes: "Você já usou os 5 projetos grátis. Compre créditos para continuar."
    });
  }

  limitePorIP[ip]++;

  console.log(`[USO] IP: ${ip} -> ${limitePorIP[ip]}/${LIMITE}`);

  next();
};
