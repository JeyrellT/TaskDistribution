/**
 * Script para generar iconos PWA placeholder
 * En producción, reemplazar con iconos reales diseñados
 */

const fs = require('fs');
const path = require('path');

const sizes = [16, 32, 72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, 'frontend/icons');

// Crear directorio si no existe
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

// SVG template para el icono
const createSVG = (size) => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4f46e5;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#818cf8;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="url(#grad)"/>
  <text x="50%" y="55%" font-family="Arial, sans-serif" font-size="${size * 0.5}" 
        fill="white" text-anchor="middle" dominant-baseline="middle">📊</text>
</svg>`;

// Generar iconos
sizes.forEach(size => {
    const svgContent = createSVG(size);
    const fileName = `icon-${size}x${size}.svg`;
    fs.writeFileSync(path.join(iconsDir, fileName), svgContent);
    console.log(`Created: ${fileName}`);
});

// Crear PNG placeholder info
fs.writeFileSync(path.join(iconsDir, 'README.md'), `# Iconos PWA

Los archivos SVG en esta carpeta son placeholders.

## Para producción:

1. Diseña un icono de 512x512 px
2. Usa herramientas como:
   - https://realfavicongenerator.net/
   - https://www.pwabuilder.com/imageGenerator
   
3. Genera todos los tamaños necesarios:
   - 16x16, 32x32 (favicon)
   - 72x72, 96x96, 128x128, 144x144, 152x152 (iOS)
   - 192x192, 384x384, 512x512 (Android/PWA)

4. Reemplaza los SVG con PNG reales

## Tamaños requeridos:
${sizes.map(s => `- ${s}x${s}`).join('\n')}
`);

console.log('\n✅ Iconos SVG placeholder generados');
console.log('📝 Nota: Reemplazar con PNG reales para producción');
