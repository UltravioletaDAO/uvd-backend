// CloudFront Function — viewer-request — ultravioletadao.xyz (PM-NS-07, Markdown for Agents)
// Runtime: cloudfront-js-2.0 (sin fetch, presupuesto ~1 ms, JS conservador).
//
// Hace tres cosas, en este orden:
//   1. www.ultravioletadao.xyz -> 301 a https://ultravioletadao.xyz (PM-NS-11).
//   2. Normaliza el header Accept a dos valores ('text/markdown' | '*/*') para que la
//      cache policy pueda incluir Accept en la cache key sin fragmentarla por browser.
//   3. Si el cliente pide EXPLÍCITAMENTE text/markdown (no vale el comodín */* que
//      manda todo browser), reescribe la URI a la copia .md de la ruta:
//        '/'            -> '/index.md'
//        '/about'       -> '/about.md'        (solo si la ruta está en MD_ROUTES)
//        cualquier otra -> '/index.md'        (fallback: el agente siempre recibe markdown)
//      No toca /.well-known/*, /static/* ni URIs con extensión (ya tienen su MIME).
//
// MD_ROUTES es la lista de rutas que TIENEN copia .md en el build (public/<ruta>.md).
// Una ruta que se agregue acá sin su .md hace que Amplify sirva index.html (SPA 404-200)
// como text/html: mantener la lista sincronizada con scripts/checkAgentMarkdown.js
// (ver docs/audit-2026-08-26/wave2/cloudfront-plan.md §5).
//
// El header Vary: Accept lo agrega la función viewer-response (vary-accept.js).

var APEX = 'ultravioletadao.xyz';
var MD_ROUTES = ['/'];

function wantsMarkdown(acceptValue) {
  var parts = acceptValue.toLowerCase().split(',');
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].split(';')[0].trim() === 'text/markdown') {
      return true;
    }
  }
  return false;
}

function buildQueryString(qs) {
  var pairs = [];
  for (var key in qs) {
    if (qs[key].multiValue) {
      for (var j = 0; j < qs[key].multiValue.length; j++) {
        pairs.push(key + '=' + qs[key].multiValue[j].value);
      }
    } else {
      pairs.push(key + '=' + qs[key].value);
    }
  }
  return pairs.length ? '?' + pairs.join('&') : '';
}

function handler(event) {
  var request = event.request;
  var headers = request.headers;

  // 1. www -> apex (301 permanente, conserva path + query string)
  var host = headers.host && headers.host.value ? headers.host.value.toLowerCase() : '';
  if (host === 'www.' + APEX) {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: { value: 'https://' + APEX + request.uri + buildQueryString(request.querystring) }
      }
    };
  }

  // 2. Normalizar Accept (cache key = URI + Accept normalizado + Accept-Encoding)
  var accept = headers.accept && headers.accept.value ? headers.accept.value : '';
  var markdown = wantsMarkdown(accept);
  headers.accept = { value: markdown ? 'text/markdown' : '*/*' };
  if (!markdown) {
    return request;
  }

  // 3. Reescritura a la copia .md
  var uri = request.uri;
  if (uri.indexOf('/.well-known/') === 0 || uri.indexOf('/static/') === 0 || uri.indexOf('.') !== -1) {
    return request;
  }
  var route = uri;
  if (route.length > 1 && route.charAt(route.length - 1) === '/') {
    route = route.substring(0, route.length - 1);
  }
  if (route === '') {
    route = '/';
  }
  if (MD_ROUTES.indexOf(route) !== -1) {
    request.uri = route === '/' ? '/index.md' : route + '.md';
  } else {
    request.uri = '/index.md';
  }
  return request;
}
