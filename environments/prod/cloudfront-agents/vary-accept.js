// CloudFront Function — viewer-response — ultravioletadao.xyz (PM-NS-07, Markdown for Agents)
// Runtime: cloudfront-js-2.0.
//
//   1. Agrega 'Accept' al header Vary (mergeando con lo que ya venga, p. ej. Accept-Encoding),
//      porque la misma URL '/' responde HTML o Markdown según Accept.
//   2. Red de seguridad de Content-Type: si la URI final termina en .md y el origen
//      la etiquetó como octet-stream / text/plain, la corrige a text/markdown.
//      NO toca text/html: si Amplify todavía reescribe *.md al SPA (falta la regla `md`
//      de customRules, ítem A4), el cuerpo es HTML y etiquetarlo markdown sería mentir.

function handler(event) {
  var response = event.response;
  var headers = response.headers;

  var tokens = [];
  var hasAccept = false;
  if (headers.vary && headers.vary.value) {
    var raw = headers.vary.value.split(',');
    for (var i = 0; i < raw.length; i++) {
      var t = raw[i].trim();
      if (t === '') { continue; }
      if (t.toLowerCase() === 'accept') { hasAccept = true; }
      tokens.push(t);
    }
  }
  if (!hasAccept) {
    tokens.push('Accept');
  }
  headers.vary = { value: tokens.join(', ') };

  var uri = event.request && event.request.uri ? event.request.uri : '';
  if (uri.length > 3 && uri.substring(uri.length - 3) === '.md') {
    var ct = headers['content-type'] && headers['content-type'].value ? headers['content-type'].value.toLowerCase() : '';
    if (ct === '' || ct.indexOf('octet-stream') !== -1 || ct.indexOf('text/plain') === 0) {
      headers['content-type'] = { value: 'text/markdown; charset=utf-8' };
    }
  }

  return response;
}
