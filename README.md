# Cyb3rLab LAN

**Biblioteca web universal para archivos alojados en tu red local.** Cyb3rLab LAN indexa los archivos de una carpeta, permite buscarlos y ordenarlos desde el navegador y los sirve como descargas directas.

## ✨ Funciones

- 📁 Lee archivos de cualquier extensión, incluidos archivos sin extensión.
- 🗂️ Incluye subcarpetas y muestra el nombre, formato, tamaño, fecha y ubicación relativa.
- 🔎 Busca por nombre, ruta o extensión; ordena por nombre, fecha o tamaño.
- ⬇️ Descarga los archivos originales sin convertirlos ni modificarlos. Admite solicitudes HTTP por rangos para archivos grandes.
- 🏠 Permite alojar la biblioteca en un NAS, mini PC o servidor de casa.
- 🔒 No sube contenido ni consulta fuentes externas. Solo comparte los archivos presentes en la carpeta configurada.

La aplicación no abre, instala, ejecuta ni valida el contenido de los archivos.

## Requisitos

- Node.js 18 o posterior.
- Un equipo que aloje la aplicación y los archivos.
- Dispositivos cliente conectados a una red que pueda alcanzar ese equipo.

No hay dependencias de npm que instalar.

## Inicio rápido

1. Coloca los archivos que quieras compartir dentro de `library/`. Puedes organizarlos en subcarpetas.
2. En la carpeta del proyecto, ejecuta:

	```sh
	npm start
	```

3. En otro dispositivo de la misma red, abre `http://IP-DEL-SERVIDOR:8080`.

El servidor muestra la dirección local disponible al arrancar. En Windows, permite Node.js en la red privada si el firewall lo solicita.

## Configuración

| Variable | Valor predeterminado | Descripción |
| --- | --- | --- |
| `PORT` | `8080` | Puerto HTTP de la aplicación. |
| `HOST` | `0.0.0.0` | Interfaz de red de escucha. Usa `127.0.0.1` para limitar el acceso al propio equipo. |
| `LIBRARY_DIR` | `./library` | Carpeta raíz que se indexará y compartirá. |

Ejemplo en Linux o macOS:

```sh
LIBRARY_DIR=/srv/cyb3rlab-archivos PORT=8080 npm start
```

Ejemplo en PowerShell:

```powershell
$env:LIBRARY_DIR = 'D:\Archivos'
$env:PORT = '8080'
npm start
```

Solo se indexan archivos regulares. Se recorren las subcarpetas; los enlaces simbólicos se ignoran. Los nombres de archivo se conservan al descargarlos.

## Uso fuera de casa

Para acceder desde otra ubicación, conecta el dispositivo a la red doméstica mediante una VPN privada, por ejemplo WireGuard o Tailscale, y utiliza la dirección privada del servidor. Para una PS5, la VPN tendría que estar disponible en el router o en un equipo que enrute su tráfico.

**No reenvíes el puerto de Cyb3rLab LAN directamente a Internet.** La aplicación no incluye autenticación ni HTTPS; cualquier persona que pueda alcanzar el servidor podría ver y descargar los archivos de la biblioteca. Mantén el acceso limitado a una red de confianza o a una VPN privada.

En Codespaces, usa la vista **Ports** de VS Code y mantén el puerto `8080` como **Private**.

## API local

- `GET /api/catalog`: devuelve el inventario y sus metadatos en JSON.
- `GET /api/download?file=RUTA`: descarga un archivo de la biblioteca; `RUTA` puede incluir subcarpetas y debe codificarse como parámetro URL.

La ruta de descarga se valida dentro de la biblioteca. No se permiten rutas que escapen de la carpeta ni enlaces simbólicos.

## Seguridad y contenido

- Comparte solo archivos cuya distribución estés autorizado a realizar.
- No coloques credenciales, claves privadas ni archivos sensibles en la carpeta compartida.
- Los archivos se entregan como descargas genéricas; la aplicación no inspecciona su formato ni comprueba si son seguros o compatibles con un dispositivo.
- Cyb3rLab LAN es una web local, no una aplicación instalable para PS5 ni un instalador de paquetes.

## Archivos de demostración

La carpeta `library/` puede contener archivos `DEMO_*` para comprobar el catálogo. Los archivos `DEMO_NO_INSTALAR_*.pkg` son texto plano con extensión `.pkg`; **no son paquetes válidos y no deben instalarse**. Elimina todos los archivos de demostración antes de usar la biblioteca con contenido real.

El contenido de `library/` se excluye de Git para evitar publicar por accidente archivos personales o de gran tamaño. Puedes mantener `library/.gitkeep` para conservar la carpeta vacía.

## Pruebas

```sh
npm test
```

Las pruebas cubren varios formatos, subcarpetas, descargas parciales, rutas inválidas y la entrega de la interfaz.
El servidor utiliza módulos incluidos en Node.js y no requiere ejecutar `npm install`.
