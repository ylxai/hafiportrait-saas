import * as React from 'react';
import { Checkbox } from '@/components/ui/checkbox';

interface BulkSelectProps {
  checked: boolean;
  indeterminate?: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
}

export function BulkSelectCheckbox({ checked, indeterminate, onCheckedChange, label }: BulkSelectProps) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        checked={indeterminate ? false : checked}
        indeterminate={indeterminate}
        onCheckedChange={onCheckedChange}
        aria-label={label || 'Select all'}
      />
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
    </div>
  );
}
