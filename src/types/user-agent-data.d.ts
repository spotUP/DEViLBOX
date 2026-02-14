// Type definitions for User-Agent Client Hints API
// https://developer.mozilla.org/en-US/docs/Web/API/Navigator/userAgentData

interface NavigatorUABrandVersion {
  brand: string;
  version: string;
}

interface UADataValues {
  brands?: NavigatorUABrandVersion[];
  mobile?: boolean;
  platform?: string;
  architecture?: string;
  bitness?: string;
  model?: string;
  platformVersion?: string;
  uaFullVersion?: string;
}

interface NavigatorUAData {
  brands: NavigatorUABrandVersion[];
  mobile: boolean;
  platform: string;
  getHighEntropyValues(hints: string[]): Promise<UADataValues>;
}

interface Navigator {
  userAgentData?: NavigatorUAData;
}
