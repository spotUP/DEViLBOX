/**
 * Web HID API Type Definitions
 * These are missing from standard TypeScript libs
 */

declare global {
  interface Navigator {
    hid: HID;
  }

  interface HID extends EventTarget {
    getDevices(): Promise<HIDDevice[]>;
    requestDevice(options: HIDDeviceRequestOptions): Promise<HIDDevice[]>;
    addEventListener(type: 'connect' | 'disconnect', listener: (event: HIDConnectionEvent) => void): void;
    removeEventListener(type: 'connect' | 'disconnect', listener: (event: HIDConnectionEvent) => void): void;
  }

  interface HIDDevice extends EventTarget {
    opened: boolean;
    vendorId: number;
    productId: number;
    productName: string;
    collections: HIDCollectionInfo[];
    open(): Promise<void>;
    close(): Promise<void>;
    sendReport(reportId: number, data: BufferSource): Promise<void>;
    sendFeatureReport(reportId: number, data: BufferSource): Promise<void>;
    receiveFeatureReport(reportId: number): Promise<DataView>;
    addEventListener(type: 'inputreport', listener: (event: HIDInputReportEvent) => void): void;
    removeEventListener(type: 'inputreport', listener: (event: HIDInputReportEvent) => void): void;
  }

  interface HIDDeviceRequestOptions {
    filters: HIDDeviceFilter[];
  }

  interface HIDDeviceFilter {
    vendorId?: number;
    productId?: number;
    usagePage?: number;
    usage?: number;
  }

  interface HIDCollectionInfo {
    usagePage: number;
    usage: number;
    type: number;
    children: HIDCollectionInfo[];
    inputReports: HIDReportInfo[];
    outputReports: HIDReportInfo[];
    featureReports: HIDReportInfo[];
  }

  interface HIDReportInfo {
    reportId: number;
    items: HIDReportItem[];
  }

  interface HIDReportItem {
    isAbsolute: boolean;
    isArray: boolean;
    isRange: boolean;
    hasNull: boolean;
    usages: number[];
    usageMinimum: number;
    usageMaximum: number;
    reportSize: number;
    reportCount: number;
    unitExponent: number;
    unitSystem: number;
    unitFactorLengthExponent: number;
    unitFactorMassExponent: number;
    unitFactorTimeExponent: number;
    unitFactorTemperatureExponent: number;
    unitFactorCurrentExponent: number;
    unitFactorLuminousIntensityExponent: number;
    logicalMinimum: number;
    logicalMaximum: number;
    physicalMinimum: number;
    physicalMaximum: number;
    strings: string[];
  }

  interface HIDInputReportEvent extends Event {
    device: HIDDevice;
    reportId: number;
    data: DataView;
  }

  interface HIDConnectionEvent extends Event {
    device: HIDDevice;
  }
}

export {};
