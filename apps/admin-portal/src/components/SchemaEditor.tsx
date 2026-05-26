import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ArrowDownward,
  ArrowUpward,
  Delete,
  Edit,
  Add,
} from '@mui/icons-material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PricingSchema,
  PricingSchemaField,
  SchemaConflict,
  TradeConfigResponse,
  updateTrade,
} from '../services/trades.service';
import { ApiError } from '../services/api.service';
import { SchemaFieldDialog } from './SchemaFieldDialog';

interface Props {
  trade: TradeConfigResponse;
  onSaved: (updated: TradeConfigResponse) => void;
}

export function SchemaEditor({ trade, onSaved }: Props): JSX.Element {
  const { t } = useTranslation();

  const [fields, setFields] = useState<PricingSchemaField[]>(
    trade.pricingSchema?.fields ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<SchemaConflict[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<PricingSchemaField | null>(null);

  // ─── Feld-Operationen ──────────────────────────────────────────────────────

  function handleAddOrEdit(field: PricingSchemaField) {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.name === field.name);
      if (idx >= 0) {
        // Bearbeiten
        const next = [...prev];
        next[idx] = field;
        return next;
      }
      // Neu hinzufügen
      return [...prev, field];
    });
    setDialogOpen(false);
    setEditingField(null);
  }

  function handleDelete(name: string) {
    setFields((prev) => prev.filter((f) => f.name !== name));
  }

  function handleMoveUp(index: number) {
    if (index === 0) return;
    setFields((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  function handleMoveDown(index: number) {
    if (index === fields.length - 1) return;
    setFields((prev) => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

  // ─── Speichern ─────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    setErrorMsg(null);
    setConflicts([]);

    try {
      const schema: PricingSchema = { fields };
      const updated = await updateTrade(trade.trade, { pricingSchema: schema });
      onSaved(updated);
      setSuccessMsg(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const data = err.data as {
          conflictingPositions?: SchemaConflict[];
        };
        setConflicts(data?.conflictingPositions ?? []);
        setErrorMsg(t('trades.schema.conflictError'));
      } else {
        setErrorMsg(t('trades.schema.saveFailed'));
      }
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h6">
          {t('trades.schema.heading')} — {trade.trade}
        </Typography>
        <Button
          startIcon={<Add />}
          variant="outlined"
          size="small"
          onClick={() => {
            setEditingField(null);
            setDialogOpen(true);
          }}
        >
          {t('trades.schema.addField')}
        </Button>
      </Stack>

      {/* Konflikt-Banner */}
      {errorMsg && (
        <Alert severity="error" onClose={() => setErrorMsg(null)}>
          <Typography variant="body2" fontWeight={600}>
            {errorMsg}
          </Typography>
          {conflicts.length > 0 && (
            <Box component="ul" sx={{ mt: 1, pl: 2 }}>
              {conflicts.map((c) => (
                <li key={c.positionKey}>
                  <Typography variant="body2">
                    Position <strong>{c.positionKey}</strong>:{' '}
                    {c.errors.join(', ')}
                  </Typography>
                </li>
              ))}
            </Box>
          )}
        </Alert>
      )}

      {/* Leerer State */}
      {fields.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {t('trades.schema.emptyState')}
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('trades.schemaPropertyNames.name')}</TableCell>
                <TableCell>{t('trades.schemaPropertyNames.type')}</TableCell>
                <TableCell>{t('trades.schemaPropertyNames.required')}</TableCell>
                <TableCell>{t('trades.schemaPropertyNames.min')}/{t('trades.schemaPropertyNames.max')}</TableCell>
                <TableCell>{t('trades.schemaPropertyNames.values')}</TableCell>
                <TableCell>{t('trades.schemaPropertyNames.dependsOn')}</TableCell>
                <TableCell align="right">Aktionen</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {fields.map((field, idx) => (
                <TableRow key={field.name} hover>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace">
                      {field.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={t(`trades.schema.types.${field.type}`)}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    {field.required ? (
                      <Chip label="✓" size="small" color="primary" />
                    ) : (
                      <Typography variant="body2" color="text.secondary">—</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {field.type === 'number'
                        ? `${field.min ?? '—'} / ${field.max ?? '—'}`
                        : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {field.type === 'enum'
                        ? field.allowedValues?.join(', ') ?? '—'
                        : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {field.dependsOn
                        ? `${field.dependsOn.field} = ${field.dependsOn.equals}`
                        : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Nach oben">
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => handleMoveUp(idx)}
                          disabled={idx === 0}
                        >
                          <ArrowUpward fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Nach unten">
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => handleMoveDown(idx)}
                          disabled={idx === fields.length - 1}
                        >
                          <ArrowDownward fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title={t('trades.schema.editField')}>
                      <IconButton
                        size="small"
                        onClick={() => {
                          setEditingField(field);
                          setDialogOpen(true);
                        }}
                      >
                        <Edit fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('trades.schema.deleteField')}>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDelete(field.name)}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Speichern Button */}
      <Stack direction="row" justifyContent="flex-end">
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} /> : null}
        >
          {saving ? t('trades.schema.saving') : t('trades.schema.save')}
        </Button>
      </Stack>

      {/* Success Snackbar */}
      <Snackbar
        open={successMsg}
        autoHideDuration={3000}
        onClose={() => setSuccessMsg(false)}
        message={t('trades.schema.saveSuccess')}
      />

      {/* Dialog */}
      <SchemaFieldDialog
        open={dialogOpen}
        initial={editingField}
        existingFieldNames={fields.map((f) => f.name)}
        onSave={handleAddOrEdit}
        onClose={() => {
          setDialogOpen(false);
          setEditingField(null);
        }}
      />
    </Stack>
  );
}