export type AddressType = 'EVM' | 'SOL' | 'FUEL';

interface AddressTypeConfig {
  displayName: string;
  validate: (address: string) => boolean;
}

// Регулярные выражения для валидации
const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const SOL_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const FUEL_ADDRESS_REGEX = /^fuel[a-zA-Z0-9]{38}$/;

export const addressTypes: Record<AddressType, AddressTypeConfig> = {
  EVM: {
    displayName: 'Ethereum-совместимые адреса (0x...)',
    validate: (address: string) => EVM_ADDRESS_REGEX.test(address)
  },
  SOL: {
    displayName: 'Solana адреса',
    validate: (address: string) => SOL_ADDRESS_REGEX.test(address)
  },
  FUEL: {
    displayName: 'Fuel адреса (fuel...)',
    validate: (address: string) => FUEL_ADDRESS_REGEX.test(address)
  }
};

export function validateAddress(address: string, type: AddressType): boolean {
  return addressTypes[type].validate(address);
}

export function getAddressTypeDisplay(type: AddressType): string {
  return addressTypes[type].displayName;
} 