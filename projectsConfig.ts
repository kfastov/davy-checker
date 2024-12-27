import { type AddressType } from './addressTypes';

export interface Project {
  name: string;
  apiEndpoint: string;
  addressType: AddressType;
  parseResponse: (data: unknown) => string;
}

export const projects: Project[] = [
  { 
    name: 'Fuel', 
    apiEndpoint: 'https://mainnet-14236c37.fuel.network/allocations?accounts={address}',
    addressType: 'FUEL',
    parseResponse: (data: unknown) => {
      const fuelData = data as { amount: string };
      return fuelData.amount || '0';
    }
  },
  { 
    name: 'USUAL', 
    apiEndpoint: 'https://app.usual.money/api/points/{address}',
    addressType: 'EVM',
    parseResponse: (data: unknown) => {
      const usualData = data as { amount: string };
      return usualData.amount || '0';
    }
  },
  {
    name: 'ODOS',
    apiEndpoint: 'https://api.odos.xyz/loyalty/users/{address}/balances',
    addressType: 'EVM',
    parseResponse: (data: unknown) => {
      const odosData = data as { data: { pendingTokenBalance: string } };
      // Convert from wei (18 decimals) to ODOS
      const amount = BigInt(odosData.data.pendingTokenBalance || '0') / BigInt(10 ** 18);
      return amount.toString();
    }
  },
  {
    name: 'LayerZero',
    apiEndpoint: 'https://api.cors.diligencedao.com/layerzero/{address}',
    addressType: 'EVM',
    parseResponse: (data: unknown) => {
      if ((data as { error: string }).error) return '0';
      return (data as { amount: string }).amount || '0';
    }
  },
  {
    name: 'KELP',
    apiEndpoint: 'https://common.kelpdao.xyz/el-merkle/proofs/{address}',
    addressType: 'EVM',
    parseResponse: (data: unknown) => {
      const kelpData = data as { 
        data: { el: string }
      };
      
      // Use only data.el value
      const totalEl = BigInt(kelpData.data?.el || '0');
      
      // Return '0' immediately if amount is zero
      if (totalEl === BigInt(0)) {
        return '0';
      }
      
      // Convert from wei (18 decimals) to KELP with rounding
      const amount = totalEl / BigInt(10 ** 18);
      const remainder = totalEl % BigInt(10 ** 18);
      
      // If no remainder, return just the whole number
      if (remainder === BigInt(0)) {
        return amount.toString();
      }
      
      // Calculate decimal part with rounding
      // Multiply by 1000 to get 3 decimal places for rounding decision
      const decimalPart = remainder * BigInt(1000) / BigInt(10 ** 18);
      
      // Round to 2 decimal places
      let roundedDecimal = (decimalPart + BigInt(5)) / BigInt(10);
      
      // Handle case when rounding up to 100
      if (roundedDecimal >= BigInt(100)) {
        return (amount + BigInt(1)).toString();
      }
      
      // Convert to string and remove trailing zeros
      const decimalStr = roundedDecimal.toString().padStart(2, '0');
      const trimmedDecimal = decimalStr.replace(/0+$/, '');
      
      return trimmedDecimal ? `${amount}.${trimmedDecimal}` : amount.toString();
    }
  }
]; 