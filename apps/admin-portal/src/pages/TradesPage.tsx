import {
  Alert,
  Box,
  Chip,
  Collapse,
  Divider,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../services/api.service';
import { listTrades, TradeConfigResponse } from '../services/trades.service';
import { SchemaEditor } from '../components/SchemaEditor';


/**
 * Trade-Konfigurationsseite mit integriertem Schema-Editor.
 *
 * Implementiert:
 *   1. pricingSchema als eigene Spalte in TradeConfig (Backend).
 *   2. PATCH /trades/:trade (nur ADMIN) zum Aktualisieren.
 *   3. Strukturierter Schema-Editor — Zeile anklicken öffnet den Editor.
 *   4. 409-Konflikt-Banner wenn das neue Schema bestehende DRAFT-Positionen invalidiert.
 */

export function TradesPage(): JSX.Element {
  const { t } = useTranslation();
  const [trades, setTrades] = useState<TradeConfigResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<string | null>(null);

  useEffect(() => {
    listTrades()
      .then(setTrades)
      .catch((err: unknown) => {
        const message =
          err instanceof ApiError ? err.message : t('trades.loadFailed');
        setError(message);
      });
  }, [t]);

  function handleRowClick(trade: string) {
    setSelectedTrade((prev) => (prev === trade ? null : trade));
  }

  function handleSaved(updated: TradeConfigResponse) {
    setTrades((prev) =>
      prev ? prev.map((t) => (t.trade === updated.trade ? updated : t)) : prev,
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!trades) {
    return (
      <Stack spacing={2}>
        <Skeleton variant="text" width={240} height={48} />
        <Skeleton variant="rounded" height={320} />
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h1">{t('trades.heading')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t('trades.subheading')}
        </Typography>
      </Stack>

      {trades.length === 0 ? (
        <Paper sx={{ p: 4 }}>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {t('trades.emptyState')}
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={0}>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>
                    {t('trades.columns.code')}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>
                    {t('trades.columns.displayName')}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="center">
                    {t('trades.columns.isActive')}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">
                    {t('trades.columns.fieldCount')}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {trades.map((trade) => (
                  <>
                    {/* Zeile klicken → Schema-Editor öffnen */}
                    <TableRow
                      key={trade.id}
                      hover
                      onClick={() => handleRowClick(trade.trade)}
                      sx={{ cursor: 'pointer' }}
                      selected={selectedTrade === trade.trade}
                    >
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace">
                          {trade.trade}
                        </Typography>
                      </TableCell>
                      <TableCell>{trade.displayName}</TableCell>
                      <TableCell align="center">
                        <Chip
                          label={trade.isActive ? '✓' : '—'}
                          size="small"
                          color={trade.isActive ? 'success' : 'default'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="text.secondary">
                          {trade.pricingSchema?.fields?.length ?? 0}
                        </Typography>
                      </TableCell>
                    </TableRow>

                    {/* Schema-Editor aufklappen */}
                    <TableRow key={`${trade.id}-editor`}>
                      <TableCell colSpan={4} sx={{ p: 0, border: 0 }}>
                        <Collapse
                          in={selectedTrade === trade.trade}
                          timeout="auto"
                          unmountOnExit
                        >
                          <Box sx={{ p: 3, bgcolor: 'background.default' }}>
                            <SchemaEditor
                              trade={trade}
                              onSaved={handleSaved}
                            />
                          </Box>
                          <Divider />
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      )}
    </Stack>
  );
}

export function countSchemaFields(metadata: Record<string, unknown>): number {
  const schema = metadata?.pricingSchema as { fields?: unknown[] } | undefined;
  if (!schema || !Array.isArray(schema.fields)) {
    return 0;
  }
  return schema.fields.length;
}