# OpenRouteService: distancia por calle entre el donante y la institución

**Integrante:** Matteo Alday · **API:** OpenRouteService, matriz de distancias (REST, responde en JSON)

## Qué problema resuelve

Cuando una institución necesita sangre, DonaVida arma la lista de donantes compatibles ordenada por cercanía. Esa
distancia se calcula con la fórmula de Haversine: es en línea recta, no por calle, y lo teníamos declarado como
limitación. Un donante a 8 km en línea recta puede estar a bastante más si hay que rodear un río o no hay un puente
cerca. Ahora la lista de la convocatoria muestra las dos: **"8 km en línea recta · 11 km por calle"**. La distancia
por calle se calcula con OpenRouteService en auto. Es un dato para que el hospital decida a quién sumar a mano: el
orden y el radio de búsqueda siguen usando la línea recta, que no depende de ningún servicio externo.

## Comparación

| | OpenRouteService | Google Distance Matrix | OSRM (servidor de demostración) |
|---|---|---|---|
| Acceso | Gratis con clave, sin tarjeta de crédito | Clave y cuenta de facturación con medio de pago, aunque se use el cupo gratuito | Gratis, sin clave |
| Datos | OpenStreetMap | Propios de Google | OpenStreetMap |
| Tráfico en tiempo real | No | Sí | No |
| Varios destinos en una consulta | Sí (endpoint de matriz) | Sí | Sí (servicio `table`) |
| Condición relevante | Límite diario y por minuto del plan gratuito (ver abajo) | Se paga por cada par origen-destino que supere el cupo gratuito | Su política dice que es una demostración: sin garantía de servicio y no para uso intensivo |

Se eligió **OpenRouteService** porque es gratuito sin tarjeta de crédito y usa los mismos datos de OpenStreetMap que
ya usa DonaVida en sus mapas y con Nominatim. Google tiene la ventaja del tráfico en tiempo real, que daría un tiempo
de viaje más realista, pero exige un medio de pago. Para un proyecto académico, eso implica que una convocatoria
grande o un error en el código terminen en un cobro. OSRM calcula lo mismo, pero su servidor público es de
demostración: para usarlo de verdad habría que instalar uno propio.

## Una sola consulta para todos los candidatos

El plan gratuito de OpenRouteService limita la cantidad de consultas por día y por minuto. Si DonaVida pidiera una
ruta por cada donante, una sola convocatoria con 50 candidatos ya gastaría 50 consultas. Por eso se usa el
**endpoint de matriz**: en una consulta se manda la institución como origen y a todos los candidatos como destinos,
y ORS devuelve todas las distancias juntas. Una convocatoria gasta siempre una consulta, tenga 3 candidatos o 300.
Además, se consulta solo al armar la propuesta, no al confirmarla, porque la distancia por calle no se guarda.

## Si el servicio se cae

La convocatoria se ve y funciona exactamente como antes del TP3: cada donante muestra solo "8 km" y el orden no cambia.
Cada consulta espera como máximo 6 segundos. Si ORS no responde, tarda, contesta con un error (clave inválida, límite
del plan agotado) o devuelve algo inesperado, la API de DonaVida deja la distancia por calle en `null` y sigue. Pasa lo
mismo si `ORS_API_KEY` está vacía en `api/.env`, así que la integración se apaga sin tocar el código. Lo probamos con
tests automáticos que simulan ORS caído, con tiempo agotado y con errores HTTP, y comparan la lista con la que arma
DonaVida sin la integración: tiene que ser idéntica. A mano se prueba pidiendo una convocatoria con la computadora
sin conexión a internet: la lista aparece, con la demora máxima de 6 segundos, igual que antes.

## Condiciones de uso respetadas

La clave está en `api/.env`, que no se sube al repositorio, y nunca en el código. Se respeta el límite del plan
gratuito con una consulta por convocatoria y como máximo 3500 destinos por consulta. Cuando se muestra la distancia
por calle, la pantalla incluye la atribución "© openrouteservice.org by HeiGIT · datos © colaboradores de
OpenStreetMap".

## Fuentes

- HeiGIT. *openrouteservice API reference: Matrix*. https://giscience.github.io/openrouteservice/api-reference/endpoints/matrix/
- HeiGIT. *openrouteservice plans* y *Terms of service*. https://openrouteservice.org/plans/ ·
  https://openrouteservice.org/terms-of-service/
- Google. *Distance Matrix API Usage and Billing*.
  https://developers.google.com/maps/documentation/distance-matrix/usage-and-billing
- Project OSRM. *Demo server usage policy*. https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server
