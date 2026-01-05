'use client';

/**
 * AQUA Launchpad - Fee Breakdown Component
 * 
 * Displays detailed fee breakdown before transactions
 * Shows all costs so user knows exactly what they're paying
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Info, AlertTriangle, CheckCircle } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface FeeBreakdownProps {
  operationAmount: number; // SOL
  platformFeePercent?: number; // Default 2%
  priorityFee?: number; // SOL
  networkFee?: number; // SOL
  currentBalance?: number; // SOL
  className?: string;
  showSufficiencyCheck?: boolean;
  compact?: boolean;
}

interface FeeItem {
  label: string;
  amount: number;
  subtext?: string;
  highlight?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PLATFORM_FEE_PERCENT = 2;
const BASE_NETWORK_FEE = 0.000005; // ~5000 lamports

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

function formatSol(sol: number): string {
  // Guard against NaN, undefined, or non-finite values
  const safeSol = typeof sol === 'number' && isFinite(sol) ? sol : 0;
  if (safeSol >= 1) return safeSol.toFixed(4);
  if (safeSol >= 0.001) return safeSol.toFixed(6);
  return safeSol.toFixed(9);
}

function formatUsd(usd: number): string {
  // Guard against NaN, undefined, or non-finite values
  const safeUsd = typeof usd === 'number' && isFinite(usd) ? usd : 0;
  if (safeUsd < 0.01) return '<$0.01';
  return `$${safeUsd.toFixed(2)}`;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function FeeBreakdown({
  operationAmount,
  platformFeePercent = PLATFORM_FEE_PERCENT,
  priorityFee = 0,
  networkFee = BASE_NETWORK_FEE,
  currentBalance,
  className,
  showSufficiencyCheck = true,
  compact = false,
}: FeeBreakdownProps) {
  // Ensure operationAmount is a valid number
  const safeAmount = typeof operationAmount === 'number' && !isNaN(operationAmount) && isFinite(operationAmount) 
    ? operationAmount 
    : 0;
  
  // Calculate fees
  const fees = useMemo(() => {
    const platformFee = safeAmount * (platformFeePercent / 100);
    const safetyBuffer = (safeAmount + platformFee + priorityFee + networkFee) * 0.001; // 0.1%
    const total = safeAmount + platformFee + priorityFee + networkFee + safetyBuffer;
    
    return {
      operation: safeAmount,
      platformFee,
      platformFeePercent,
      priorityFee,
      networkFee,
      safetyBuffer,
      total,
    };
  }, [safeAmount, platformFeePercent, priorityFee, networkFee]);
  
  // Check balance sufficiency
  const balanceStatus = useMemo(() => {
    if (currentBalance === undefined) return null;
    
    const sufficient = currentBalance >= fees.total;
    const shortfall = sufficient ? 0 : fees.total - currentBalance;
    
    return { sufficient, shortfall, currentBalance };
  }, [currentBalance, fees.total]);
  
  // Build fee items
  const feeItems: FeeItem[] = useMemo(() => {
    const items: FeeItem[] = [
      {
        label: 'Transaction Amount',
        amount: fees.operation,
        highlight: true,
      },
      {
        label: `Platform Fee (${fees.platformFeePercent}%)`,
        amount: fees.platformFee,
        subtext: 'Collected on success only',
      },
    ];
    
    if (fees.priorityFee > 0) {
      items.push({
        label: 'Priority Fee',
        amount: fees.priorityFee,
        subtext: 'For faster confirmation',
      });
    }
    
    items.push({
      label: 'Network Fee',
      amount: fees.networkFee,
      subtext: 'Solana transaction fee',
    });
    
    if (!compact && fees.safetyBuffer > 0) {
      items.push({
        label: 'Safety Buffer (0.1%)',
        amount: fees.safetyBuffer,
        subtext: 'For slippage protection',
      });
    }
    
    return items;
  }, [fees, compact]);
  
  return (
    <div className={cn('fee-breakdown', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 text-sm text-cyan-300/80">
        <Info className="w-4 h-4" />
        <span>Transaction Cost Breakdown</span>
      </div>
      
      {/* Fee Items */}
      <div className="space-y-2">
        {feeItems.map((item, index) => (
          <div
            key={item.label}
            className={cn(
              'flex justify-between items-center py-1.5',
              index < feeItems.length - 1 && 'border-b border-cyan-900/30'
            )}
          >
            <div className="flex-1">
              <div className={cn(
                'text-sm',
                item.highlight ? 'text-white font-medium' : 'text-gray-300'
              )}>
                {item.label}
              </div>
              {item.subtext && !compact && (
                <div className="text-xs text-gray-500">{item.subtext}</div>
              )}
            </div>
            <div className={cn(
              'text-right font-mono',
              item.highlight ? 'text-white' : 'text-gray-300'
            )}>
              <div className="text-sm">{formatSol(item.amount)} SOL</div>
            </div>
          </div>
        ))}
        
        {/* Total */}
        <div className="flex justify-between items-center pt-3 border-t-2 border-cyan-500/30">
          <div className="text-sm font-medium text-white">Total Required</div>
          <div className="text-right">
            <div className="text-lg font-bold text-cyan-400 font-mono">
              {formatSol(fees.total)} SOL
            </div>
          </div>
        </div>
      </div>
      
      {/* Balance Check */}
      {showSufficiencyCheck && balanceStatus && (
        <div className={cn(
          'mt-4 p-3 rounded-lg flex items-start gap-2',
          balanceStatus.sufficient
            ? 'bg-green-900/20 border border-green-500/30'
            : 'bg-red-900/20 border border-red-500/30'
        )}>
          {balanceStatus.sufficient ? (
            <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-sm">
            <div className={cn(
              'font-medium',
              balanceStatus.sufficient ? 'text-green-400' : 'text-red-400'
            )}>
              {balanceStatus.sufficient
                ? 'Sufficient Balance'
                : 'Insufficient Balance'}
            </div>
            <div className="text-gray-400 mt-0.5">
              Current balance: {formatSol(balanceStatus.currentBalance)} SOL
              {!balanceStatus.sufficient && (
                <span className="text-red-400 ml-2">
                  (Need {formatSol(balanceStatus.shortfall)} more)
                </span>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Info Note */}
      {!compact && (
        <div className="mt-3 text-xs text-gray-500">
          <Info className="w-3 h-3 inline mr-1" />
          Platform fee is only collected if the transaction succeeds
        </div>
      )}
    </div>
  );
}

// ============================================================================
// COMPACT VERSION FOR INLINE USE
// ============================================================================

export function FeeBreakdownCompact({
  operationAmount,
  platformFeePercent = PLATFORM_FEE_PERCENT,
}: {
  operationAmount: number;
  platformFeePercent?: number;
}) {
  const platformFee = operationAmount * (platformFeePercent / 100);
  const total = operationAmount + platformFee + BASE_NETWORK_FEE;
  
  return (
    <div className="text-xs text-gray-400 flex items-center gap-2">
      <span>Total: {formatSol(total)} SOL</span>
      <span className="text-gray-600">|</span>
      <span>{platformFeePercent}% fee included</span>
    </div>
  );
}

export default FeeBreakdown;

