import { useState, useCallback } from 'react';
import { trpc } from '@/providers/trpc';

export type EditState = 'IDLE' | 'EDITING' | 'SAVING' | 'SAVED' | 'REJECTED' | 'CONFLICT';

export interface EditableFieldConfig {
  key: string;
  label: string;
  type: 'currency' | 'percent' | 'integer' | 'select' | 'boolean';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  defaultValue?: number | string | boolean;
  description?: string;
}

export function useEditableField(
  initialValue: any,
  onSave: (value: any) => Promise<{ success: boolean; error?: string; currentVersion?: number }>
) {
  const [value, setValue] = useState(initialValue);
  const [editValue, setEditValue] = useState<string>(String(initialValue));
  const [state, setState] = useState<EditState>('IDLE');
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const startEdit = useCallback(() => {
    setEditValue(String(value));
    setIsEditing(true);
    setState('EDITING');
    setError(null);
  }, [value]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setState('IDLE');
    setError(null);
    setEditValue(String(value));
  }, [value]);

  const saveEdit = useCallback(async () => {
    setState('SAVING');
    try {
      let parsedValue: any = editValue;
      if (!isNaN(Number(editValue))) parsedValue = Number(editValue);
      if (editValue === 'true') parsedValue = true;
      if (editValue === 'false') parsedValue = false;

      const result = await onSave(parsedValue);
      if (result.success) {
        setValue(parsedValue);
        setState('SAVED');
        setIsEditing(false);
        setTimeout(() => setState('IDLE'), 2000);
      } else if (result.error === 'CONFIGURATION_CONFLICT') {
        setState('CONFLICT');
        setError('Another user changed this setting. Reloading latest value...');
      } else {
        setState('REJECTED');
        setError(result.error || 'Validation failed');
      }
    } catch (e) {
      setState('REJECTED');
      setError('Network error');
    }
  }, [editValue, onSave]);

  return {
    value, editValue, setEditValue, state, error, isEditing,
    startEdit, cancelEdit, saveEdit, setValue,
  };
}

export function useRiskProfile(userId: number = 1, accountId: number = 1) {
  const utils = trpc.useUtils();
  const { data: profiles } = trpc.autonomous.getRiskProfiles.useQuery({ userId, accountId });
  const activeProfile = profiles?.find((p: any) => p.isActive) ?? profiles?.[0];

  const updateMutation = trpc.autonomous.updateRiskProfile.useMutation({
    onSuccess: () => {
      utils.autonomous.getRiskProfiles.invalidate({ userId, accountId });
      utils.autonomous.getConfigurationEvents.invalidate();
    },
  });

  const resetMutation = trpc.autonomous.resetRiskProfileToDefault.useMutation({
    onSuccess: () => {
      utils.autonomous.getRiskProfiles.invalidate({ userId, accountId });
    },
  });

  return {
    profile: activeProfile,
    profiles: profiles ?? [],
    update: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    reset: resetMutation.mutateAsync,
    isResetting: resetMutation.isPending,
  };
}

export function useStrategySelectionProfile(userId: number = 1, accountId: number = 1) {
  const utils = trpc.useUtils();
  const { data: profile } = trpc.autonomous.getStrategySelectionProfile.useQuery({ userId, accountId });
  const { data: preferences } = trpc.autonomous.getStrategyUserPreferences.useQuery({ userId, accountId });
  const { data: strategies } = trpc.autonomous.getStrategies.useQuery();

  const updateSelection = trpc.autonomous.updateStrategySelectionProfile.useMutation({
    onSuccess: () => {
      utils.autonomous.getStrategySelectionProfile.invalidate({ userId, accountId });
    },
  });

  const updatePreference = trpc.autonomous.updateStrategyUserPreference.useMutation({
    onSuccess: () => {
      utils.autonomous.getStrategyUserPreferences.invalidate({ userId, accountId });
    },
  });

  return {
    selectionProfile: profile,
    preferences: preferences ?? [],
    strategies: strategies ?? [],
    updateSelection: updateSelection.mutateAsync,
    updatePreference: updatePreference.mutateAsync,
    isUpdating: updateSelection.isPending || updatePreference.isPending,
  };
}

export function useProtectionProfile(userId: number = 1, accountId: number = 1) {
  const utils = trpc.useUtils();
  const { data: profileData } = trpc.autonomous.getProtectionProfile.useQuery({ userId, accountId });
  const profile = profileData?.[0];

  const update = trpc.autonomous.updateProtectionProfile.useMutation({
    onSuccess: () => {
      utils.autonomous.getProtectionProfile.invalidate({ userId, accountId });
    },
  });

  return { profile, update: update.mutateAsync, isUpdating: update.isPending };
}

export function useConfigurationHistory(limit: number = 50) {
  const { data: events } = trpc.autonomous.getConfigurationEvents.useQuery({ limit });
  return { events: events ?? [] };
}
