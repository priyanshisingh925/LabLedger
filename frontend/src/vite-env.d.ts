/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EXPLORER_URL?: string;
  readonly VITE_RPC_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface EthereumProvider {
  isMetaMask?: boolean;
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on(event: string, handler: (...args: any[]) => void): void;
  removeListener(event: string, handler: (...args: any[]) => void): void;
}

interface Window {
  ethereum?: EthereumProvider;
}
