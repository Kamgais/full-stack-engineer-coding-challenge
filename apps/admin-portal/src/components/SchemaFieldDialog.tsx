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

interface Props {
  open: boolean;
  initial: PricingSchemaField | null;
  existingFieldNames: string[];
  onSave: (field: PricingSchemaField) => void;
  onClose: () => void;
}

const EMPTY: PricingSchemaField = {
  name: '',
  type: 'string',
  required: false,
};

export function SchemaFieldDialog({
  open,
  initial,
  existingFieldNames,
  onSave,
  onClose,
}: Props): JSX.Element {
  const { t } = useTranslation();
  const [field, setField] = useState<PricingSchemaField>(EMPTY);
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    if (open) {
      setField(initial ?? EMPTY);
      setNameError('');
    }
  }, [open, initial]);

  function handleTypeChange(type: PricingSchemaField['type']) {
    // Typ wechseln — min/max/allowedValues zurücksetzen
    setField((f) => ({
      name: f.name,
      type,
      required: f.required,
      dependsOn: f.dependsOn,
    }));
  }

  function handleSave() {
    // Validierung
    if (!field.name.trim()) {
      setNameError(t('trades.schema.fieldName') + ' ist Pflicht');
      return;
    }
    const isDuplicate =
      !initial &&
      existingFieldNames.includes(field.name.trim());
    if (isDuplicate) {
      setNameError('Dieser Feldname existiert bereits');
      return;
    }

    // allowedValues als String parsen
    const parsed: PricingSchemaField = {
      ...field,
      name: field.name.trim(),
    };

    onSave(parsed);
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
            value={field.name}
            onChange={(e) => {
              setField((f) => ({ ...f, name: e.target.value }));
              setNameError('');
            }}
            error={!!nameError}
            helperText={nameError}
            disabled={!!initial}
            fullWidth
            size="small"
          />

          {/* Typ */}
          <FormControl fullWidth size="small">
            <InputLabel>{t('trades.schema.fieldType')}</InputLabel>
            <Select
              value={field.type}
              label={t('trades.schema.fieldType')}
              onChange={(e) =>
                handleTypeChange(e.target.value as PricingSchemaField['type'])
              }
            >
              {(['string', 'number', 'boolean', 'enum'] as const).map((t_) => (
                <MenuItem key={t_} value={t_}>
                  {t(`trades.schema.types.${t_}`)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Pflichtfeld */}
          <FormControlLabel
            control={
              <Checkbox
                checked={field.required}
                onChange={(e) =>
                  setField((f) => ({ ...f, required: e.target.checked }))
                }
              />
            }
            label={t('trades.schema.fieldRequired')}
          />

          {/* Min/Max — nur bei number */}
          {field.type === 'number' && (
            <>
              <TextField
                label={t('trades.schema.fieldMin')}
                type="number"
                value={field.min ?? ''}
                onChange={(e) =>
                  setField((f) => ({
                    ...f,
                    min: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
                fullWidth
                size="small"
              />
              <TextField
                label={t('trades.schema.fieldMax')}
                type="number"
                value={field.max ?? ''}
                onChange={(e) =>
                  setField((f) => ({
                    ...f,
                    max: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
                fullWidth
                size="small"
              />
            </>
          )}

          {/* Erlaubte Werte — nur bei enum */}
          {field.type === 'enum' && (
            <TextField
              label={t('trades.schema.fieldAllowedValues')}
              value={field.allowedValues?.join(', ') ?? ''}
              onChange={(e) =>
                setField((f) => ({
                  ...f,
                  allowedValues: e.target.value
                    .split(',')
                    .map((v) => v.trim())
                    .filter(Boolean),
                }))
              }
              helperText="z.B. wood, pvc, aluminum"
              fullWidth
              size="small"
            />
          )}

          <Divider />

          {/* dependsOn */}
          <TextField
            label={t('trades.schema.fieldDependsOn')}
            value={field.dependsOn?.field ?? ''}
            onChange={(e) =>
              setField((f) => ({
                ...f,
                dependsOn: e.target.value
                  ? { field: e.target.value, equals: f.dependsOn?.equals ?? '' }
                  : undefined,
              }))
            }
            helperText="Feldname von dem dieses Feld abhängt"
            fullWidth
            size="small"
          />

          {field.dependsOn?.field && (
            <TextField
              label={t('trades.schema.fieldDependsOnValue')}
              value={field.dependsOn?.equals ?? ''}
              onChange={(e) =>
                setField((f) => ({
                  ...f,
                  dependsOn: {
                    field: f.dependsOn!.field,
                    equals: e.target.value,
                  },
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
          Abbrechen
        </Button>
        <Button onClick={handleSave} variant="contained">
          {t('trades.schema.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}