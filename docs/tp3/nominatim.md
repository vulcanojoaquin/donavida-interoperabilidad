# Nominatim: coordenadas de una institución a partir de su dirección

**Integrante:** Joaquín Vulcano · **API:** Nominatim, el buscador de OpenStreetMap (REST, responde en JSON)

## Qué problema resuelve

Al dar de alta una institución, la latitud y la longitud se cargaban a mano. DonaVida usa esas coordenadas para
calcular la distancia entre cada donante y la institución, con la que ordena a quién convocar, y para ubicarla en el
mapa público: un error de tipeo puede desplazarla kilómetros. Ahora, el botón **"Buscar coordenadas"** del formulario
envía la dirección a la API de DonaVida, que consulta a Nominatim y completa los dos campos. Siguen siendo editables, y
el formulario muestra la dirección encontrada para confirmarla: en las pruebas, "Av. Argentina 1200" sin la ciudad
apareció en Merlo, Buenos Aires. Si Nominatim ubica la calle pero no la altura, avisa que la ubicación es aproximada.

## Comparación

| | Nominatim | Google Geocoding | Georef (datos.gob.ar) |
|---|---|---|---|
| Acceso | Gratis, sin clave | Clave y facturación habilitada; se paga por consulta | Gratis; en las pruebas respondió sin clave |
| Cobertura | Mundial (se limita a Argentina) | Mundial | Solo Argentina |
| "Hospital Castro Rendón, Neuquén" | Encuentra el edificio del hospital | No se probó (requiere clave) | Sin resultados: solo busca direcciones |
| "Av. Argentina 1200, Neuquén" | Encuentra la avenida, no la altura | No se probó | Ubica la altura 1200 |
| Condición relevante | Política de uso (ver abajo) | Si sus resultados se muestran en un mapa, tiene que ser de Google | — |

Se eligió **Nominatim** porque es gratuito, no requiere clave y encuentra a las instituciones también por su nombre.
Google quedó descartado porque DonaVida muestra las instituciones en mapas de OpenStreetMap. Georef ubica mejor la
altura de una dirección argentina, pero no encuentra un hospital por su nombre; queda como mejora posible.

## Si el servicio se cae

La API de DonaVida responde que no encontró la dirección, sin error, y el formulario avisa "No encontramos esa
dirección, cargá las coordenadas a mano": funciona igual que antes del TP3. Cada consulta espera como máximo 5 segundos.

## Condiciones de uso respetadas

La política de Nominatim exige, y DonaVida cumple: como máximo una consulta por segundo para toda la aplicación (la API
las pone en fila), un User-Agent que identifique a DonaVida, guardar en caché lo ya buscado, mostrar la atribución
"© colaboradores de OpenStreetMap", no autocompletar mientras se escribe (se busca solo al tocar el botón) y poder
dejar de usarlo si OpenStreetMap lo pide, sin cambiar el código: `GEOCODIFICACION_DESACTIVADA=true` en `api/.env`.

## Fuentes

- OpenStreetMap Foundation. *Nominatim Usage Policy*. https://operations.osmfoundation.org/policies/nominatim/
- Nominatim. *Search queries* y *Place ranking*. https://nominatim.org/release-docs/latest/api/Search/ ·
  https://nominatim.org/release-docs/latest/customize/Ranking/
- Google. *Geocoding API Usage and Billing* y *Geocoding API Policies*.
  https://developers.google.com/maps/documentation/geocoding/usage-and-billing ·
  https://developers.google.com/maps/documentation/geocoding/policies
- Datos Argentina. *API Georef*. https://datosgobar.github.io/georef-ar-api/
- Pruebas propias con Nominatim y Georef, 26/10/2026.
