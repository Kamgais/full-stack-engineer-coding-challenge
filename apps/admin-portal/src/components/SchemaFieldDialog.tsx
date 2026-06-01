import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from '@mui/material';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { PricingSchemaField } from '../services/trades.service';
import {
  applyTypeChange,
  formStateToSchemaField,
  schemaFieldToFormState,
  SchemaFieldFormState,
  validateSchemaFieldFormState,
} from './SchemaEditor.helpers';

interface Props {
  open: boolean;
  initial: PricingSchemaField | null;
  existingFieldNames: string[];
  onSave: (field: PricingSchemaField) => void;
  onClose: () => void;
}

const EMPTY_STATE: SchemaFieldFormState = {
  name: '',
  type: 'string',
  required: false,
  min: '',
  max: '',
  allowedValues: '',
  dependsOnField: '',
  dependsOnValue: '',
};

export function SchemaFieldDialog({
  open,
  initial,
  existingFieldNames,
  onSave,
  onClose,
}: Props): JSX.Element {
  const { t } = useTranslation();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<SchemaFieldFormState>({
    defaultValues: EMPTY_STATE,
  });

  const watchedType = watch('type');
  const watchedDependsOnField = watch('dependsOnField');

  useEffect(() => {
    if (open) {
      reset(initial ? schemaFieldToFormState(initial) : EMPTY_STATE);
    }
  }, [open, initial, reset]);

  function handleTypeChange(newType: PricingSchemaField['type']) {
    const current = {
      name: watch('name'),
      type: watchedType,
      required: watch('required'),
      min: watch('min'),
      max: watch('max'),
      allowedValues: watch('allowedValues'),
      dependsOnField: watch('dependsOnField'),
      dependsOnValue: watch('dependsOnValue'),
    };
    // applyTypeChange helper nutzen
    const updated = applyTypeChange(current, newType);
    reset(updated);
  }

  function onSubmit(values: SchemaFieldFormState) {
    // validateSchemaFieldFormState helper nutzen
    const validationErrors = validateSchemaFieldFormState(
      values,
      existingFieldNames,
      !initial,
    );

    if (validationErrors.length > 0) {
      validationErrors.forEach((e) => {
        // Fehler manuell in react-hook-form setzen
        setValue(e.field as keyof SchemaFieldFormState, values[e.field as keyof SchemaFieldFormState]);
      });
      // Ersten Fehler als name-Error setzen
      const nameError = validationErrors.find((e) => e.field === 'name');
      if (nameError) {
        // react-hook-form setError nutzen
        return;
      }
      return;
    }

    // formStateToSchemaField helper nutzen
    onSave(formStateToSchemaField(values));
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {initial
          ? t('trades.schema.editField')
          : t('trades.schema.addField')}
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>

          {/* Feldname */}
          <TextField
            label={t('trades.schema.fieldName')}
            size="small"
            fullWidth
            disabled={!!initial}
            {...register('name', {
              required: t('trades.schema.fieldName') + ' ist Pflicht',
              validate: (value) => {
                if (!initial && existingFieldNames.includes(value.trim())) {
                  return 'Dieser Feldname existiert bereits';
                }
                return true;
              },
            })}
            error={!!errors.name}
            helperText={errors.name?.message}
          />

          {/* Typ — Source of Truth */}
          <Controller
            name="type"
            control={control}
            render={({ field }) => (
              <FormControl fullWidth size="small">
                <InputLabel>{t('trades.schema.fieldType')}</InputLabel>
                <Select
                  {...field}
                  label={t('trades.schema.fieldType')}
                  onChange={(e) => {
                    field.onChange(e);
                    handleTypeChange(e.target.value as PricingSchemaField['type']);
                  }}
                >
                  {(['string', 'number', 'boolean', 'enum'] as const).map((type) => (
                    <MenuItem key={type} value={type}>
                      {t(`trades.schema.types.${type}`)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />

          {/* Pflichtfeld */}
          <Controller
            name="required"
            control={control}
            render={({ field }) => (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                  />
                }
                label={t('trades.schema.fieldRequired')}
              />
            )}
          />

          {/* Min/Max — nur bei number */}
          {watchedType === 'number' && (
            <>
              <TextField
                label={t('trades.schema.fieldMin')}
                type="number"
                size="small"
                fullWidth
                {...register('min')}
                error={!!errors.max}
              />
              <TextField
                label={t('trades.schema.fieldMax')}
                type="number"
                size="small"
                fullWidth
                {...register('max', {
                  validate: (value) => {
                    const min = watch('min');
                    if (min && value && Number(min) > Number(value)) {
                      return 'Max muss größer als Min sein';
                    }
                    return true;
                  },
                })}
                error={!!errors.max}
                helperText={errors.max?.message}
              />
            </>
          )}

          {/* Erlaubte Werte — nur bei enum */}
          {watchedType === 'enum' && (
            <TextField
              label={t('trades.schema.fieldAllowedValues')}
              size="small"
              fullWidth
              {...register('allowedValues', {
                validate: (value) => {
                  if (watchedType === 'enum') {
                    const values = value
                      .split(',')
                      .map((v) => v.trim())
                      .filter(Boolean);
                    if (values.length === 0) {
                      return 'Mindestens ein Wert ist Pflicht';
                    }
                  }
                  return true;
                },
              })}
              error={!!errors.allowedValues}
              helperText={errors.allowedValues?.message ?? 'z.B. wood, pvc, aluminum'}
            />
          )}

          <Divider />

          {/* dependsOn Feld */}
          <TextField
            label={t('trades.schema.fieldDependsOn')}
            size="small"
            fullWidth
            {...register('dependsOnField', {
              validate: (value) => {
                if (
                  value.trim() &&
                  !existingFieldNames.includes(value.trim())
                ) {
                  return `Feld "${value}" existiert nicht im Schema`;
                }
                return true;
              },
            })}
            error={!!errors.dependsOnField}
            helperText={
              errors.dependsOnField?.message ??
              t('trades.schema.fieldDependsOn')
            }
          />

          {/* dependsOn Wert — nur wenn Feld gesetzt */}
          {watchedDependsOnField && (
            <TextField
              label={t('trades.schema.fieldDependsOnValue')}
              size="small"
              fullWidth
              {...register('dependsOnValue')}
            />
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color="inherit">
          {t('trades.schema.save') === 'Speichern' ? 'Abbrechen' : 'Cancel'}
        </Button>
        <Button onClick={handleSubmit(onSubmit)} variant="contained">
          {t('trades.schema.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}