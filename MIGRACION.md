# Notas de análisis y migración

## Proyecto recibido

El código original era una aplicación Laravel con vistas Blade, jQuery y peticiones AJAX. La asignación de lugares estaba distribuida entre varios controladores y seis vistas de mapas. Las operaciones de asignar, desasignar y vaciar el mapa se realizaban mediante peticiones `GET`, y cada vista repetía gran parte del código JavaScript.

La información de personas se encontraba en el catálogo `invitadosbut.csv`; el proyecto no incluía una base de datos lista para ejecutarse.

## Transformación realizada

- Frontend independiente en Angular.
- API REST en NestJS.
- SQLite como base local, sin MySQL ni otro servicio adicional.
- Una sola interfaz para todas las plantillas de asientos.
- Operaciones de escritura mediante `POST`, `PUT`, `PATCH` y `DELETE`.
- Validación de datos en la API.
- Restricción para que una persona tenga un solo asiento por versión.
- Cambio automático de asiento si se reasigna a la misma persona dentro de una versión.
- Versiones independientes del acomodo, con opción de copiar o comenzar vacías.
- Selector separado de tipo de escenario y versión.
- Historial filtrado por escenario, con acceso directo a versiones anteriores.
- Fotografías JPG/PNG almacenadas localmente y asociadas a las personas.
- Exportación Word del listado de asientos.
- Exportación Word de etiquetas con la geometría de la plantilla `S-14075BLU`.
- Exportación PDF con el mapa de asientos (plano del recinto y ocupación, con la fotografía de cada persona al frente del curul) y el listado de asignaciones —con una columna de fotografías— en un mismo documento.

## Mapas preservados

| Plantilla | Posiciones reales conservadas |
| --- | ---: |
| Pleno · configuración original | 129 |
| Pleno · configuración 100 | 100 |
| Pleno · configuración 90 | 130 |
| Pleno · configuración 91 | 131 |
| Gradas · configuración 40 | 64 |
| Salón Benito Juárez | 90 |

Los nombres “90”, “91” y “40” se conservaron porque así aparecen en el proyecto original. El número real de posiciones se calculó a partir de cada llamada original a `initSeatChart`, por lo que puede no coincidir con el nombre histórico de la vista.

La numeración de los grupos de asientos se invierte al cargar las definiciones (`reverseGroupLabels` en `layout-definitions.ts`): la última letra de cada nivel pasa a ser A (D→A, C→B, …), conservando la geometría y el número de cada lugar. El cambio es consistente en el mapa, las asignaciones, el listado y las exportaciones.

También se conservaron el plano del pleno, el plano del Salón Benito Juárez, los gráficos de asiento disponible/asignado y el imagotipo institucional.

## Base de datos

El archivo `apps/api/data/seating.sqlite` contiene:

- `layouts`: plantillas y distribución de los asientos.
- `people`: directorio local de personas y referencia de su fotografía.
- `arrangements`: versiones del acomodo.
- `assignments`: relación entre persona, asiento y versión.

El primer arranque crea las tablas y, si el directorio está vacío, importa las 58 personas contenidas en el catálogo original.

Las fotografías no se guardan dentro de SQLite: se conservan en `apps/api/data/uploads/people`, mientras la base registra su nombre, tipo y relación con la persona. Los documentos Word se generan al momento y no requieren Microsoft Word instalado en el servidor.

## Documentos Word

- **Listado de asientos:** versión, escenario, fecha, resumen y tabla ordenada naturalmente por asiento.
- **Etiquetas:** hoja Carta con márgenes y tabla fija equivalentes al documento entregado; 10 etiquetas de 4 × 2 pulgadas, 2 columnas × 5 filas y separación horizontal de 3/16 de pulgada.
- Cuando existe una fotografía se integra en la etiqueta; en caso contrario se muestran las iniciales.

## Reglas principales

1. Un asiento sólo puede pertenecer a una persona dentro de una versión.
2. Una persona sólo puede ocupar un asiento dentro de la misma versión.
3. Las versiones son independientes; cambiar una no modifica las demás.
4. Archivar una persona la retira del directorio activo, pero no borra su historial de versiones.
5. Siempre debe existir al menos una versión por cada tipo de escenario.
