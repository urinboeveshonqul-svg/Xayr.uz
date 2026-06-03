import { cn } from '@/lib/utils';
import { getProgress } from '@/lib/utils';

interface ProgressBarProps {
  raised: number;
  goal: number;
  className?: string;
  showLabel?: boolean;
}

export function ProgressBar({ raised, goal, className, showLabel = false }: ProgressBarProps) {
  const pct = getProgress(raised, goal);
  return (
    <div className={cn('w-full', className)}>
      {showLabel && (
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
          <span>{pct}% to'plandi</span>
          <span>Maqsad: {goal.toLocaleString()} so'm</span>
        </div>
      )}
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
