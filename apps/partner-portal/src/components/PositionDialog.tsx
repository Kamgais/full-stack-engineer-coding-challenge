import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  CatalogPosition,
  PricingSchemaField,
  UpsertPositionRequest,
} from '../services/pricing-catalogs.service';

interface Props {
  open: boolean;
  initial: CatalogPosition | null;
  schemaFields: PricingSchemaField[];
  onSave: (position: UpsertPositionRequest) => void;
  onClose: () => void;
}

type PositionForm = {
  key: string;
  label: string;
  unit: string;
  netPriceEur: string;
  vatRate: string;
  minQuantity: string;
  maxQuantity: string;
  tradeAttributes: Record<string, string>;
};

const UNITS = ['piece', 'm2', 'meter', 'hour', 'flat'];

export function PositionDialog({
  open,
  initial,
  schemaFields,
  onSave,
  onClose,
}: Props): JSX.Element {
  const { t } = useTranslation();

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    formState: { errors },
  } = useForm<PositionForm>();

  useEffect(() => {
    if (open) {
      reset({
        key: initial?.key ?? '',
        label: initial?.label ?? '',
        unit: initial?.unit ?? 'piece',
        netPriceEur: initial
          ? (initial.netPriceMinorUnits / 100).toFixed(2)
          : '',
        vatRate: initial ? String(initial.vatRate * 100) : '19',
        minQuantity: initial?.minQuantity ? String(initial.minQuantity) : '',
        maxQuantity: initial?.maxQuantity ? String(initial.maxQuantity) : '',
        tradeAttributes: Object.fromEntries(
          schemaFields.map((f) => [
            f.name,
            String(initial?.tradeAttributes?.[f.name] ?? ''),
          ]),
        ),
      });
    }
  }, [open, initial, schemaFields, reset]);

  const watchedAttributes = watch('tradeAttributes');

  function isFieldVisible(field: PricingSchemaField): boolean {
    if (!field.dependsOn) return true;
    const depValue = watchedAttributes?.[field.dependsOn.field];
    return depValue === String(field.dependsOn.equals);
  }

  function onSubmit(values: PositionForm) {
    const tradeAttributes: Record<string, unknown> = {};

    for (const field of schemaFields) {
      if (!isFieldVisible(field)) continue;
      const raw = values.tradeAttributes[field.name];
      if (raw === '' || raw === undefined) continue;

      if (field.type === 'number') {
        tradeAttributes[field.name] = Number(raw);
      } else if (field.type === 'boolean') {
        tradeAttributes[field.name] = raw === 'true';
      } else {
        tradeAttributes[field.name] = raw;
      }
    }

    onSave({
      key: values.key.trim(),
      label: values.label.trim(),
      unit: values.unit,
      netPriceMinorUnits: Math.round(parseFloat(values.netPriceEur) * 100),
      vatRate: parseFloat(values.vatRate) / 100,
      minQuantity: values.minQuantity ? Number(values.minQuantity) : undefined,
      maxQuantity: values.maxQuantity ? Number(values.maxQuantity) : undefined,
      tradeAttributes,
    });
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {initial
          ? t('pricing.positions.edit')
          : t('pricing.positions.add')}
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>

          {/* Basis-Felder */}
          <TextField
            label={t('pricing.positions.columns.key')}
            size="small"
            fullWidth
            disabled={!!initial}
            {...register('key', { required: true })}
            error={!!errors.key}
          />

          <TextField
            label={t('pricing.positions.columns.label')}
            size="small"
            fullWidth
            {...register('label', { required: true })}
            error={!!errors.label}
          />

          <Controller
            name="unit"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <FormControl fullWidth size="small">
                <InputLabel>{t('pricing.positions.columns.unit')}</InputLabel>
                <Select {...field} label={t('pricing.positions.columns.unit')}>
                  {UNITS.map((u) => (
                    <MenuItem key={u} value={u}>
                      {t(`pricing.positions.units.${u}`)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />

          <TextField
            label={t('pricing.positions.columns.netPrice') + ' (€)'}
            size="small"
            fullWidth
            type="number"
            inputProps={{ step: '0.01', min: '0' }}
            {...register('netPriceEur', { required: true, min: 0 })}
            error={!!errors.netPriceEur}
          />

          <TextField
            label={t('pricing.positions.columns.vat') + ' (%)'}
            size="small"
            fullWidth
            type="number"
            inputProps={{ step: '1', min: '0', max: '100' }}
            {...register('vatRate', { required: true })}
            error={!!errors.vatRate}
          />

          <Stack direction="row" spacing={2}>
            <TextField
              label="Min. Menge"
              size="small"
              fullWidth
              type="number"
              {...register('minQuantity')}
            />
            <TextField
              label="Max. Menge"
              size="small"
              fullWidth
              type="number"
              {...register('maxQuantity')}
            />
          </Stack>

          {/* Dynamische Trade-Attribute vom Schema */}
          {schemaFields.length > 0 && (
            <>
              <Typography variant="subtitle2" color="text.secondary">
                Trade-Attribute
              </Typography>

              {schemaFields.map((field) => {
                if (!isFieldVisible(field)) return null;

                // Enum → Select
                if (field.type === 'enum') {
                  return (
                    <Controller
                      key={field.name}
                      name={`tradeAttributes.${field.name}`}
                      control={control}
                      rules={{ required: field.required }}
                      render={({ field: f }) => (
                        <FormControl fullWidth size="small">
                          <InputLabel>{field.name}</InputLabel>
                          <Select {...f} label={field.name}>
                            {field.allowedValues?.map((v) => (
                              <MenuItem key={v} value={v}>
                                {v}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      )}
                    />
                  );
                }

                // Boolean → Select
                if (field.type === 'boolean') {
                  return (
                    <Controller
                      key={field.name}
                      name={`tradeAttributes.${field.name}`}
                      control={control}
                      rules={{ required: field.required }}
                      render={({ field: f }) => (
                        <FormControl fullWidth size="small">
                          <InputLabel>{field.name}</InputLabel>
                          <Select {...f} label={field.name}>
                            <MenuItem value="true">Ja</MenuItem>
                            <MenuItem value="false">Nein</MenuItem>
                          </Select>
                        </FormControl>
                      )}
                    />
                  );
                }

                // Number / String → TextField
                return (
                  <TextField
                    key={field.name}
                    label={field.name}
                    size="small"
                    fullWidth
                    type={field.type === 'number' ? 'number' : 'text'}
                    inputProps={
                      field.type === 'number'
                        ? { min: field.min, max: field.max, step: 'any' }
                        : {}
                    }
                    {...register(`tradeAttributes.${field.name}`, {
                      required: field.required,
                    })}
                    helperText={
                      field.type === 'number' && (field.min !== undefined || field.max !== undefined)
                        ? `${field.min ?? '—'} bis ${field.max ?? '—'}`
                        : undefined
                    }
                  />
                );
              })}
            </>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Abbrechen
        </Button>
        <Button onClick={handleSubmit(onSubmit)} variant="contained">
          {t('pricing.draft.publish') === 'Veröffentlichen'
            ? 'Speichern'
            : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}