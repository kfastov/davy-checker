export interface Project {
  name: string;
  apiEndpoint: string;
  parseResponse: (data: unknown) => string;
}

export const projects: Project[] = [
  { 
    name: 'Fuel', 
    apiEndpoint: 'https://mainnet-14236c37.fuel.network/allocations?accounts={address}',
    parseResponse: (data: unknown) => {
      const fuelData = data as { amount: string };
      return fuelData.amount || '0';
    }
  },
  // { 
  //   name: '$Pingu', 
  //   apiEndpoint: 'https://api.clusters.xyz/v0.1/airdrops/pengu/eligibility/{address}',
  //   parseResponse: (data: unknown) => {
  //     const pinguData = data as { totalUnclaimed: number };
  //     return pinguData.totalUnclaimed.toString() || '0';
  //   }
  // },
  { 
    name: 'USUAL', 
    apiEndpoint: 'https://app.usual.money/api/points/{address}',
    parseResponse: (data: unknown) => {
      const usualData = data as { amount: string };
      return usualData.amount || '0';
    }
  },
  {
    name: 'ODOS',
    apiEndpoint: 'https://api.odos.xyz/loyalty/users/{address}/balances',
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
    parseResponse: (data: unknown) => {
      if ((data as { error: string }).error) return '0';
      return (data as { amount: string }).amount || '0';
    }
  },
  {
    name: 'KELP',
    apiEndpoint: 'https://common.kelpdao.xyz/el-merkle/proofs/{address}',
    parseResponse: (data: unknown) => {
      const kelpData = data as { 
        data: { el: string }
      };
      
      // Use only data.el value
      const totalEl = BigInt(kelpData.data?.el || '0');
      
      // Convert from wei (18 decimals) to KELP with rounding
      const amount = totalEl / BigInt(10 ** 18);
      const remainder = totalEl % BigInt(10 ** 18);
      
      // Calculate decimal part with rounding
      // Multiply by 1000 to get 3 decimal places for rounding decision
      const decimalPart = remainder * BigInt(1000) / BigInt(10 ** 18);
      
      // Round to 2 decimal places
      let roundedDecimal = (decimalPart + BigInt(5)) / BigInt(10);
      
      // Handle case when rounding up to 100
      if (roundedDecimal >= BigInt(100)) {
        return `${amount + BigInt(1)}.00`;
      }
      
      return `${amount}.${roundedDecimal.toString().padStart(2, '0')}`;
    }
  }
]; 