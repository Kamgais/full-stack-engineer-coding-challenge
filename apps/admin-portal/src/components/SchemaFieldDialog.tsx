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
import { useEffect, useState } from 'react';
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
  const [state, setState] = useState<SchemaFieldFormState>(EMPTY_STATE);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      // schemaFieldToFormState helper nutzen
      setState(initial ? schemaFieldToFormState(initial) : EMPTY_STATE);
      setErrors({});
    }
  }, [open, initial]);

  function handleTypeChange(newType: PricingSchemaField['type']) {
    // applyTypeChange helper nutzen — löscht irrelevante Felder
    setState((prev) => applyTypeChange(prev, newType));
  }

  function handleSave() {
    // validateSchemaFieldFormState helper nutzen
    const validationErrors = validateSchemaFieldFormState(
      state,
      existingFieldNames,
      !initial,
    );

    if (validationErrors.length > 0) {
      const errorMap: Record<string, string> = {};
      validationErrors.forEach((e) => {
        errorMap[e.field] = e.message;
      });
      setErrors(errorMap);
      return;
    }

    // formStateToSchemaField helper nutzen
    onSave(formStateToSchemaField(state));
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
            value={state.name}
            onChange={(e) => {
              setState((prev) => ({ ...prev, name: e.target.value }));
              setErrors((prev) => ({ ...prev, name: '' }));
            }}
            error={!!errors.name}
            helperText={errors.name}
            disabled={!!initial}
            fullWidth
            size="small"
          />

          {/* Typ — Source of Truth für min/max/allowedValues */}
          <FormControl fullWidth size="small">
            <InputLabel>{t('trades.schema.fieldType')}</InputLabel>
            <Select
              value={state.type}
              label={t('trades.schema.fieldType')}
              onChange={(e) =>
                handleTypeChange(e.target.value as PricingSchemaField['type'])
              }
            >
              {(['string', 'number', 'boolean', 'enum'] as const).map((type) => (
                <MenuItem key={type} value={type}>
                  {t(`trades.schema.types.${type}`)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Pflichtfeld */}
          <FormControlLabel
            control={
              <Checkbox
                checked={state.required}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, required: e.target.checked }))
                }
              />
            }
            label={t('trades.schema.fieldRequired')}
          />

          {/* Min/Max — nur bei number */}
          {state.type === 'number' && (
            <>
              <TextField
                label={t('trades.schema.fieldMin')}
                type="number"
                value={state.min}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, min: e.target.value }))
                }
                error={!!errors.max}
                fullWidth
                size="small"
              />
              <TextField
                label={t('trades.schema.fieldMax')}
                type="number"
                value={state.max}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, max: e.target.value }))
                }
                error={!!errors.max}
                helperText={errors.max}
                fullWidth
                size="small"
              />
            </>
          )}

          {/* Erlaubte Werte — nur bei enum */}
          {state.type === 'enum' && (
            <TextField
              label={t('trades.schema.fieldAllowedValues')}
              value={state.allowedValues}
              onChange={(e) =>
                setState((prev) => ({ ...prev, allowedValues: e.target.value }))
              }
              error={!!errors.allowedValues}
              helperText={errors.allowedValues ?? 'z.B. wood, pvc, aluminum'}
              fullWidth
              size="small"
            />
          )}

          <Divider />

          {/* dependsOn Feld */}
          <TextField
            label={t('trades.schema.fieldDependsOn')}
            value={state.dependsOnField}
            onChange={(e) =>
              setState((prev) => ({ ...prev, dependsOnField: e.target.value }))
            }
            error={!!errors.dependsOnField}
            helperText={
              errors.dependsOnField ??
              t('trades.schema.fieldDependsOn')
            }
            fullWidth
            size="small"
          />

          {/* dependsOn Wert — nur wenn Feld gesetzt */}
          {state.dependsOnField && (
            <TextField
              label={t('trades.schema.fieldDependsOnValue')}
              value={state.dependsOnValue}
              onChange={(e) =>
                setState((prev) => ({
                  ...prev,
                  dependsOnValue: e.target.value,
                }))
              }
              fullWidth
              size="small"
            />
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color="inherit">
          {t('trades.schema.save') === 'Speichern' ? 'Abbrechen' : 'Cancel'}
        </Button>
        <Button onClick={handleSave} variant="contained">
          {t('trades.schema.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}