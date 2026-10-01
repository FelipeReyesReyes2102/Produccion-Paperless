export type PrinterDevice = {
  uid: string;
  name: string;
  connection: string;
  send: (data: string, ok: () => void, fail: (error: unknown) => void) => void;
};
type BrowserPrintAPI = {
  getLocalDevices: (
    ok: (devices: PrinterDevice[]) => void,
    fail: (error: unknown) => void,
    type: string,
  ) => void;
};
declare global {
  interface Window {
    BrowserPrint?: BrowserPrintAPI;
  }
}
let loading: Promise<BrowserPrintAPI> | undefined;
export function browserPrint(): Promise<BrowserPrintAPI> {
  if (window.BrowserPrint) return Promise.resolve(window.BrowserPrint);
  if (loading) return loading;
  loading = new Promise<BrowserPrintAPI>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/BrowserPrint.min.js';
    const timer = setTimeout(() => {
      script.remove();
      reject(new Error('Browser Print no respondió al cargar.'));
    }, 10000);
    script.onload = () => {
      clearTimeout(timer);
      window.BrowserPrint
        ? resolve(window.BrowserPrint)
        : reject(new Error('Biblioteca Browser Print inválida.'));
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      reject(
        new Error(
          'Falta la biblioteca oficial de Zebra Browser Print. Ejecuta CONFIGURAR_ZEBRA.ps1 con el archivo del SDK.',
        ),
      );
    };
    document.head.appendChild(script);
  }).catch((e) => {
    loading = undefined;
    throw e;
  });
  return loading;
}
export async function discoverPrinters() {
  const sdk = await browserPrint();
  return new Promise<PrinterDevice[]>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(new Error('No se pudo conectar con Browser Print. Inícialo y autoriza este sitio.')),
      12000,
    );
    sdk.getLocalDevices(
      (devices) => {
        clearTimeout(timer);
        resolve(devices);
      },
      () => {
        clearTimeout(timer);
        reject(
          new Error(
            'No se pudo conectar con Zebra Browser Print. Comprueba que esté iniciado y autoriza este sitio.',
          ),
        );
      },
      'printer',
    );
  });
}
export function sendLabel(device: PrinterDevice, zpl: string) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            'No se confirmó el envío. Revisa la impresora antes de reimprimir para evitar duplicados.',
          ),
        ),
      15000,
    );
    device.send(
      zpl,
      () => {
        clearTimeout(timer);
        resolve();
      },
      () => {
        clearTimeout(timer);
        reject(
          new Error(
            'Falló el envío a la impresora. El tubo está guardado; revisa la impresora antes de reimprimir.',
          ),
        );
      },
    );
  });
}
