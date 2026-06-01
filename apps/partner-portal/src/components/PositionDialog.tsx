import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
import { isFieldVisible } from '../pages/PricingCatalogPage.helpers';

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

  function onSubmit(values: PositionForm) {
    const tradeAttributes: Record<string, unknown> = {};

    for (const field of schemaFields) {
      // isFieldVisible aus helpers nutzen
      if (!isFieldVisible(field, watchedAttributes ?? {})) continue;
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

          <TextField
            label={t('pricing.positions.columns.key')}
            size="small"
            fullWidth
            disabled={!!initial}
            {...register('key', { required: true })}
            error={!!errors.key}
            helperText={errors.key ? t('validation.required') : undefined}
          />

          <TextField
            label={t('pricing.positions.columns.label')}
            size="small"
            fullWidth
            {...register('label', { required: true })}
            error={!!errors.label}
            helperText={errors.label ? t('validation.required') : undefined}
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
                      {t(`pricing.positions.units.${u}` as any)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />

          <TextField
            label={`${t('pricing.positions.columns.netPrice')} (€)`}
            size="small"
            fullWidth
            type="number"
            inputProps={{ step: '0.01', min: '0' }}
            {...register('netPriceEur', { required: true, min: 0 })}
            error={!!errors.netPriceEur}
            helperText={errors.netPriceEur ? t('validation.required') : undefined}
          />

          <TextField
            label={`${t('pricing.positions.columns.vat')} (%)`}
            size="small"
            fullWidth
            type="number"
            inputProps={{ step: '1', min: '0', max: '100' }}
            {...register('vatRate', { required: true })}
            error={!!errors.vatRate}
            helperText={errors.vatRate ? t('validation.required') : undefined}
          />

          <Stack direction="row" spacing={2}>
            <TextField
              label={t('pricing.positions.minQuantity')}
              size="small"
              fullWidth
              type="number"
              {...register('minQuantity')}
            />
            <TextField
              label={t('pricing.positions.maxQuantity')}
              size="small"
              fullWidth
              type="number"
              {...register('maxQuantity')}
            />
          </Stack>

          {/* Dynamische Trade-Attribute vom Schema */}
          {schemaFields.length > 0 && (
            <>
              <Divider />
              <Typography variant="subtitle2" color="text.secondary">
                {t('pricing.positions.tradeAttributes')}
              </Typography>

              {schemaFields.map((field) => {
                // isFieldVisible aus helpers
                if (!isFieldVisible(field, watchedAttributes ?? {})) return null;

                if (field.type === 'enum') {
                  return (
                    <Controller
                      key={field.name}
                      name={`tradeAttributes.${field.name}`}
                      control={control}
                      rules={{ required: field.required }}
                      render={({ field: f, fieldState }) => (
                        <FormControl fullWidth size="small">
                          <InputLabel>{field.name}</InputLabel>
                          <Select
                            {...f}
                            label={field.name}
                            error={!!fieldState.error}
                          >
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

                if (field.type === 'boolean') {
                  return (
                    <Controller
                      key={field.name}
                      name={`tradeAttributes.${field.name}`}
                      control={control}
                      rules={{ required: field.required }}
                      render={({ field: f, fieldState }) => (
                        <FormControl fullWidth size="small">
                          <InputLabel>{field.name}</InputLabel>
                          <Select
                            {...f}
                            label={field.name}
                            error={!!fieldState.error}
                          >
                            <MenuItem value="true">{t('common.yes')}</MenuItem>
                            <MenuItem value="false">{t('common.no')}</MenuItem>
                          </Select>
                        </FormControl>
                      )}
                    />
                  );
                }

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
                      field.type === 'number' &&
                      (field.min !== undefined || field.max !== undefined)
                        ? `${field.min ?? '—'} ${t('common.to')} ${field.max ?? '—'}`
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
          {t('common.cancel')}
        </Button>
        <Button onClick={handleSubmit(onSubmit)} variant="contained">
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}