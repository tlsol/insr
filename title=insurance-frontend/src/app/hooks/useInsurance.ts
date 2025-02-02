'use client';

import { usePrepareContractWrite, useContractWrite, useTransaction } from 'wagmi';
import { CONTRACTS } from './contracts';
import { parseEther } from 'viem';
import { useTransactionToast } from './useTransactionToast';
import { useEffect } from 'react';
import { ethers } from 'ethers';

export function useInsurance() {
  const { showToast, updateToast } = useTransactionToast();

  // Prepare the transaction configuration
  const { config } = usePrepareContractWrite({
    address: CONTRACTS.INSURANCE_POOL.address,
    abi: new ethers.utils.Interface(CONTRACTS.INSURANCE_POOL.abi),
    functionName: 'purchasePolicy',
  });

  // Use the prepared config in the contract write hook.
  const {
    writeContract: purchaseInsurance,
    data: purchaseData,
    isPending: isPurchasing,
    error: purchaseError,
  } = useContractWrite({
    ...config,
  });

  const { isLoading: isPurchaseProcessing } = useTransaction({
    hash: purchaseData,
  });

  // Trigger toast when purchaseData is available.
  useEffect(() => {
    if (purchaseData) {
      showToast(purchaseData.hash);
    }
  }, [purchaseData, showToast]);

  const purchase = async (addresses: string[], amounts: bigint[]) => {
    purchaseInsurance?.({
      args: [addresses, amounts],
    });
  };

  return {
    purchase,
    isPurchasing: isPurchasing || isPurchaseProcessing,
    error: purchaseError,
  };
}