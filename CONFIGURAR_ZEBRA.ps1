param([Parameter(Mandatory=$true)][string]$Biblioteca)
$ErrorActionPreference='Stop'
$source=Get-Item -LiteralPath $Biblioteca
if ($source.Extension -ne '.js') { throw 'Selecciona BrowserPrint-3.x.xxx.min.js del SDK oficial de Zebra.' }
$content=Get-Content -LiteralPath $source.FullName -Raw
if ($content -notmatch 'BrowserPrint' -or $content -notmatch 'getLocalDevices') { throw 'El archivo no parece ser la biblioteca base Browser Print.' }
$destination=Join-Path $PSScriptRoot 'frontend\public\vendor\BrowserPrint.min.js'
Copy-Item -LiteralPath $source.FullName -Destination $destination -Force
Write-Host 'Biblioteca incorporada. Instala y abre Zebra Browser Print en cada equipo de captura.'
Write-Host 'En Winder: Buscar impresoras, elegir Zebra, configurar medidas y guardar.'
Write-Host 'Para una publicación compilada, ejecuta npm run build en frontend.'

