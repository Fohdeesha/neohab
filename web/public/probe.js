// Say so on a browser too old to run this, before the bundle is even asked for. Plain ES5: it has to
// run on the browser it is refusing. A file rather than inline, because the page's content policy
// refuses inline script. It carries its own few strings, since the catalogs load with the app.
;(function () {
  if (
    window.CSS &&
    CSS.supports &&
    CSS.supports('selector(:has(*))') &&
    CSS.supports('color', 'color-mix(in srgb, red 50%, blue)')
  ) {
    return
  }
  var TEXT = {
    en: [
      'This browser is too old for neohab',
      'neohab needs Chrome or Edge 111, Safari 16.4, Firefox 121, or a matching Android WebView. Older browsers load the page but cannot lay it out, so it would look broken rather than tell you why.',
      'On a wall tablet that cannot be updated, installing a current browser from its app store is usually the fix.'
    ],
    de: [
      'Dieser Browser ist zu alt für neohab',
      'neohab braucht Chrome oder Edge 111, Safari 16.4, Firefox 121 oder ein entsprechendes Android-WebView. Ältere Browser laden die Seite, können sie aber nicht darstellen, und sie sähe kaputt aus, statt zu sagen, warum.',
      'Auf einem Wandtablet, das sich nicht aktualisieren lässt, hilft meist ein aktueller Browser aus dem App-Store.'
    ],
    es: [
      'Este navegador es demasiado antiguo para neohab',
      'neohab necesita Chrome o Edge 111, Safari 16.4, Firefox 121 o un Android WebView equivalente. Los navegadores más antiguos cargan la página pero no pueden maquetarla, así que se vería rota en lugar de explicar por qué.',
      'En una tableta de pared que no se puede actualizar, lo habitual es instalar un navegador actual desde su tienda de aplicaciones.'
    ],
    fr: [
      'Ce navigateur est trop ancien pour neohab',
      'neohab a besoin de Chrome ou Edge 111, Safari 16.4, Firefox 121 ou d’une WebView Android équivalente. Les navigateurs plus anciens chargent la page sans pouvoir la mettre en forme : elle paraîtrait cassée au lieu de dire pourquoi.',
      'Sur une tablette murale qu’on ne peut pas mettre à jour, installer un navigateur récent depuis sa boutique d’applications règle en général le problème.'
    ],
    it: [
      'Questo browser è troppo vecchio per neohab',
      'neohab richiede Chrome o Edge 111, Safari 16.4, Firefox 121 o una WebView Android equivalente. I browser più vecchi caricano la pagina ma non riescono a impaginarla, quindi sembrerebbe rotta invece di spiegarne il motivo.',
      'Su un tablet a parete che non si può aggiornare, di solito basta installare un browser recente dal suo store.'
    ],
    nl: [
      'Deze browser is te oud voor neohab',
      'neohab heeft Chrome of Edge 111, Safari 16.4, Firefox 121 of een vergelijkbare Android WebView nodig. Oudere browsers laden de pagina wel, maar kunnen hem niet opmaken, zodat hij kapot lijkt in plaats van te zeggen waarom.',
      'Op een wandtablet die niet bij te werken is, helpt meestal een actuele browser uit de appwinkel.'
    ],
    pl: [
      'Ta przeglądarka jest za stara dla neohab',
      'neohab wymaga przeglądarki Chrome lub Edge 111, Safari 16.4, Firefox 121 albo odpowiedniego Android WebView. Starsze przeglądarki wczytują stronę, ale nie potrafią jej ułożyć, więc wyglądałaby na zepsutą, zamiast powiedzieć dlaczego.',
      'Na tablecie ściennym, którego nie da się zaktualizować, zwykle pomaga instalacja aktualnej przeglądarki ze sklepu z aplikacjami.'
    ]
  }
  // the same choice the app makes: the language picked in Settings, else the first the browser offers that we have
  var lang = null
  try {
    lang = localStorage.getItem('neohab:language')
  } catch (e) {
    lang = null
  }
  if (!lang || !TEXT[lang]) {
    var wanted = navigator.languages || [navigator.language]
    lang = 'en'
    for (var i = 0; i < wanted.length; i++) {
      var base = String(wanted[i] || '').slice(0, 2).toLowerCase()
      if (TEXT[base]) {
        lang = base
        break
      }
    }
  }
  var text = TEXT[lang]
  var el = document.createElement('div')
  el.setAttribute('lang', lang)
  el.setAttribute(
    'style',
    'position:fixed;inset:0;top:0;left:0;right:0;bottom:0;z-index:2147483647;overflow:auto;' +
      'padding:2rem 1.25rem;background:#0f1317;color:#dde3ea;font:16px/1.5 system-ui,sans-serif'
  )
  var box = document.createElement('div')
  box.setAttribute('style', 'margin:0 auto;max-width:34rem')
  var parts = [
    ['h1', 'font-size:1.3rem;margin:0 0 .75rem', text[0]],
    ['p', 'margin:0 0 .75rem', text[1]],
    ['p', 'margin:0;color:#93a1b0', text[2]]
  ]
  for (var j = 0; j < parts.length; j++) {
    var node = document.createElement(parts[j][0])
    node.setAttribute('style', parts[j][1])
    node.appendChild(document.createTextNode(parts[j][2]))
    box.appendChild(node)
  }
  el.appendChild(box)
  document.body.appendChild(el)
})()
