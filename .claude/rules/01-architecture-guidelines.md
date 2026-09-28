# Directivas de Arquitectura y Código (Astro + React + Supabase)

Estas reglas son ESTRICTAS y de cumplimiento obligatorio para cualquier código generado en este proyecto. El objetivo es mantener una separación impecable entre diseño (UI) y lógica de negocio, permitiendo escalabilidad y fácil mantenimiento.

## 1. Estructura de Directorios

El proyecto debe respetar estrictamente esta jerarquía en el directorio `src/`:

- `src/components/ui/`: Componentes puros de diseño (Botones, Inputs, Modales). No tienen estado complejo ni lógica de negocio.
- `src/components/domain/`: Componentes específicos del negocio (InvoiceCard, LoginForm). Ensamblan componentes UI y reciben datos por props.
- `src/layouts/`: Estructuras de página de Astro (Headers, Footers, SEO).
- `src/pages/`: Únicamente enrutamiento (Astro). Las páginas deben ser lo más delgadas posible, delegando la vista a componentes y la lógica a utilidades.
- `src/pages/api/`: Endpoints del backend (SSR). Actúan como controladores que llaman a los servicios.
- `src/hooks/`: Custom hooks de React para manejar el estado local y la interacción del usuario.
- `src/services/`: Lógica de comunicación con el exterior (APIs, Supabase, Google Drive). 
- `src/utils/`: Funciones puras (formateo de fechas, validaciones, matemáticas).
- `src/adapters/`: Capa de transformación de datos (ver Patrón Adapter).

## 2. Separación de Preocupaciones (Design vs Logic)

- **Componentes Tontos (Presentational):** Todo el diseño visual (Tailwind CSS) debe vivir en componentes que solo reciben `props` y emiten eventos. No deben saber de dónde vienen los datos.
- **Componentes Inteligentes (Container):** Si un componente necesita datos de la base de datos o lógica compleja, delega esa lógica a un Custom Hook (`useInvoices.ts`) o a un servicio.
- **Cambios de Diseño Seguros:** Modificar clases de Tailwind en `components/ui` jamás debe romper la lógica de `hooks` o `services`.

## 3. Patrones de Diseño Obligatorios

### Patrón Facade (Fachada)
Obligatorio para ocultar la complejidad de librerías de terceros o APIs externas.
- **Regla:** Ningún componente ni endpoint de Astro debe llamar directamente a la API de Google Drive o a `pdf-lib`.
- **Implementación:** Crea clases o módulos como `GoogleDriveFacade` que expongan métodos simples como `uploadInvoice(pdfBuffer, houseNumber, month, year)`. La fachada internamente maneja la autenticación, la búsqueda de carpetas y los reintentos.

### Patrón Adapter (Adaptador)
Obligatorio para aislar el frontend de los esquemas exactos de la base de datos o APIs externas.
- **Regla:** Los datos que devuelve Supabase (`snake_case` o estructuras anidadas) NO deben llegar crudos a los componentes de UI.
- **Implementación:** Crea funciones adaptadoras en `src/adapters/` (ej. `supabaseInvoiceToDomainInvoice(data)`) que transformen la respuesta externa en una interfaz limpia de TypeScript (`camelCase`) que el frontend consuma. Si la base de datos cambia mañana, solo se modifica el adaptador.

## 4. Principios SOLID a Exigir

- **S - Single Responsibility:** Un archivo, un propósito. Si un archivo maneja UI, llamadas a BD y formateo de fechas, divídelo. Extrae el formateo a `utils/` y la BD a `services/`.
- **O - Open/Closed:** Diseña componentes de UI extensibles (usando `children` de React o `slots` de Astro) en lugar de llenarlos de decenas de condiciones `if/else` para cambiar su apariencia.
- **D - Dependency Inversion:** Las lógicas de alto nivel (generación de facturas) no deben depender de implementaciones de bajo nivel. Usa interfaces de TypeScript para definir contratos de servicios.

## 5. Reglas del Ecosistema Astro/React

- Prefiere **Astro** para todo lo estático y para el renderizado inicial.
- Usa **React** (`client:load`, `client:idle`) ÚNICAMENTE donde se requiera interactividad en el cliente (formularios del panel de administración, modales dinámicos).
- Los componentes de React no deben usar variables de entorno del servidor. Toda comunicación segura debe hacerse llamando a los endpoints en `src/pages/api/`.