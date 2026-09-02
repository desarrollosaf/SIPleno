# Sistema local de asignación de asientos

Aplicación Angular + NestJS para administrar personas, asignarlas a lugares y conservar distintas versiones de un acomodo. Los datos se guardan en una base SQLite local; no necesita un servidor de base de datos adicional.

## Requisitos

- Node.js 22.22.3 o posterior
- npm 10 o posterior

## Puesta en marcha

```bash
npm install
npm run dev
```

Abra `http://localhost:4200`. La API se ejecuta en `http://localhost:3000/api`.

La base de datos se crea automáticamente en `apps/api/data/seating.sqlite`. En el primer inicio se cargan las personas incluidas en el archivo original y se crea una versión inicial para cada tipo de escenario.

## Uso básico

1. Elija el **Tipo de escenario** y la versión que desea modificar.
2. Seleccione una persona en el panel izquierdo y haga clic en un asiento disponible.
3. Haga clic en un asiento ocupado para consultar sus datos o desasignarlo.
4. Use **Guardar como nueva versión** para obtener una copia independiente del acomodo actual.
5. Abra **Historial** para consultar y recuperar versiones anteriores del escenario seleccionado.
6. Use **Nueva persona** para agregar un registro y, si lo desea, una fotografía JPG o PNG de hasta 5 MB.
7. Desde el menú **•••** del directorio puede **Importar desde CSV**, **Exportar a CSV** o **Borrar todos** los invitados.
8. En **Exportar** puede descargar el **Mapa + listado (PDF)** —el plano con los asientos ocupados más la tabla de asignaciones—, el listado de asientos en Word o las etiquetas Word compatibles con la plantilla `S-14075BLU`.

El listado del PDF incluye **todos los asientos** del escenario, ordenados por grupo en la secuencia A, AA, B, BB, C, CC… y, dentro de cada grupo, por número. Los asientos sin persona aparecen igualmente en la tabla, marcados como «Disponible» y con el resto de los campos en blanco.

Cuando la persona tiene fotografía registrada, esta se muestra —en un tamaño reducido— a la derecha del curul en el mapa, y en la columna inicial de la tabla; el número de asiento va dentro del propio curul, en color, para que sirva como indicativo. Las etiquetas de los asientos desocupados en el mapa usan una fuente reducida que se ajusta al ancho del asiento.

La numeración de los grupos de asientos está invertida respecto del orden original: la última letra pasa a ser A. Por ejemplo, en un escenario con grupos A, B, C, D, ahora la que era D es A, la C es B, y así sucesivamente (la geometría y el número de cada lugar se conservan).

El correo electrónico es opcional al registrar una persona; sólo se valida el formato cuando se captura algo. En el formulario de personas, la fotografía puede cargarse arrastrando la imagen sobre el recuadro o seleccionándola desde el explorador de archivos.

Al asignar una persona a un asiento, esta desaparece del directorio de la izquierda y vuelve a aparecer en cuanto se desasigna, de modo que la lista sólo muestra a quienes aún no tienen lugar en la versión abierta.

### Importar personas desde CSV

Una persona por línea, columnas separadas por comas: `Nombre completo, Cargo, Institución, Correo, Notas`. Sólo el nombre es obligatorio. Puede incluir una primera fila de encabezados (en español o inglés); se detecta automáticamente. Si no hay encabezados, se toma el orden anterior. Puede pegar el contenido o seleccionar un archivo `.csv`.

### Borrar todo el directorio

**Borrar todos** elimina de forma permanente a todas las personas, sus asignaciones en todas las versiones y sus fotografías. El catálogo inicial sólo se importa la primera vez, por lo que el directorio permanece vacío aunque reinicie la aplicación. Conviene usar **Exportar a CSV** antes, como respaldo.

Las etiquetas se generan en hoja Carta: 10 etiquetas de 4 × 2 pulgadas, en dos columnas y cinco filas. Incluyen nombre, cargo, institución y asiento. Si la persona tiene fotografía, se muestra a la izquierda; en caso contrario, el texto ocupa todo el ancho (sin recuadro de iniciales).

## Producción local

```bash
npm run build
npm start
```

La aplicación completa quedará disponible en `http://localhost:3000`.

## Respaldo

Para respaldar toda la información, detenga la aplicación y copie:

- `apps/api/data/seating.sqlite`
- `apps/api/data/uploads/people`

El primer elemento conserva personas, escenarios, versiones y asignaciones; el segundo contiene las fotografías.

## Rendimiento en un servidor

La base SQLite usa WAL con `synchronous = NORMAL` y `busy_timeout`, de modo que cada asignación evita un `fsync` completo; en el frontend, al asignar o desasignar la lista de versiones se refresca en segundo plano para no encadenar dos peticiones. En la exportación PDF, cada fotografía se incrusta una sola vez y se reutiliza en el mapa y en la tabla.

Para que se sienta ágil publicado en internet conviene, además: ejecutar el API compilado (`node dist/main.js`, no el servidor de desarrollo), poner un proxy con gzip/brotli enfrente (por ejemplo Nginx), servir las fotografías con caché, y subir imágenes de tamaño razonable (las fotos muy grandes hacen más lenta la generación del PDF). Si el proveedor apaga el servicio por inactividad, la primera visita pagará el arranque en frío.

Al generar el PDF, las fotografías se normalizan antes de incrustarse: los JPEG se usan tal cual y los PNG se aplanan sobre fondo blanco para quitarles la transparencia (canal alfa). Esto es importante porque pdfkit procesa los PNG con canal alfa por una ruta asíncrona que puede quedarse bloqueada en servidores con poca CPU; al eliminar la transparencia usa su ruta rápida y síncrona. Las imágenes no reconocidas o enormes (más de ~4 millones de píxeles) se omiten y la persona aparece con sus iniciales. Aun así, lo ideal es subir fotografías de tamaño moderado.
