import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Paper,
  Skeleton,
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Delete, Edit } from '@mui/icons-material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../services/api.service';
import {
  calculateQuote,
  CatalogPosition,
  CatalogVersion,
  createCatalogVersion,
  formatCents,
  getTrade,
  listCatalogVersions,
  PricingSchemaField,
  publishCatalogVersion,
  QuoteLine,
  QuoteResult,
  updateCatalogVersion,
  UpsertPositionRequest,
} from '../services/pricing-catalogs.service';
import { PositionDialog } from '../components/PositionDialog';

// ─── Hilfsfunktion ────────────────────────────────────────────────────────────

function positionToRequest(p: CatalogPosition): UpsertPositionRequest {
  return {
    key: p.key,
    label: p.label,
    unit: p.unit,
    netPriceMinorUnits: p.netPriceMinorUnits,
    vatRate: p.vatRate,
    minQuantity: p.minQuantity ?? undefined,
    maxQuantity: p.maxQuantity ?? undefined,
    tradeAttributes: p.tradeAttributes,
    surcharges: p.surcharges,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PricingCatalogPage(): JSX.Element {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [selectedTab, setSelectedTab] = useState(0);
  const [versions, setVersions] = useState<Record<string, CatalogVersion | null>>({});
  const [schemaFields, setSchemaFields] = useState<Record<string, PricingSchemaField[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<{
    severity: 'success' | 'error';
    message: string;
  } | null>(null);

  // Dialog states
  const [positionDialog, setPositionDialog] = useState<{
    open: boolean;
    initial: CatalogPosition | null;
  }>({ open: false, initial: null });
  const [publishDialog, setPublishDialog] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [trades, setTrades] = useState<string[]>([]);
  // Quote state
  const [quoteQtys, setQuoteQtys] = useState<Record<string, string>>({});
  const [quoteResult, setQuoteResult] = useState<QuoteResult | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const currentTrade = trades[selectedTab] as string | undefined;
  const currentVersion = currentTrade ? versions[currentTrade] : null;
  const currentSchema = currentTrade ? (schemaFields[currentTrade] ?? []) : [];
  const isDraft = currentVersion?.status === 'DRAFT';

  // ─── Daten laden ────────────────────────────────────────────────────────────

useEffect(() => {
  if (!user?.craftsmanId) {
    setLoading(false);
    return;
  }

  // Zuerst Craftsman laden um die Trades zu bekommen
  import('../services/craftsmen.service')
    .then(({ fetchCraftsman }) => fetchCraftsman(user.craftsmanId!))
    .then((craftsman) => {
      setTrades(craftsman.trades);
      return craftsman.trades;
    })
    .then((craftsmanTrades) => {
      if (craftsmanTrades.length === 0) {
        setLoading(false);
        return;
      }

      return Promise.all(
        craftsmanTrades.map(async (trade: string) => {
          const [tradeVersions, tradeConfig] = await Promise.all([
            listCatalogVersions(trade),
            getTrade(trade),
          ]);

          const draft = tradeVersions.find((v) => v.status === 'DRAFT');
          const published = tradeVersions
            .filter((v) => v.status === 'PUBLISHED')
            .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];

          return {
            trade,
            version: draft ?? published ?? null,
            schema: tradeConfig.pricingSchema?.fields ?? [],
          };
        }),
      ).then((results) => {
        const vMap: Record<string, CatalogVersion | null> = {};
        const sMap: Record<string, PricingSchemaField[]> = {};
        results.forEach(({ trade, version, schema }) => {
          vMap[trade] = version;
          sMap[trade] = schema;
        });
        setVersions(vMap);
        setSchemaFields(sMap);
      });
    })
    .catch((err: unknown) => {
      const message =
        err instanceof ApiError ? err.message : t('app.errors.generic');
      setError(message);
    })
    .finally(() => setLoading(false));
}, [user, t]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  async function handleCreateDraft() {
    if (!currentTrade) return;
    try {
      const version = await createCatalogVersion(
        currentTrade,
        new Date().toISOString(),
      );
      setVersions((prev) => ({ ...prev, [currentTrade]: version }));
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : t('app.errors.generic');
      setSnack({ severity: 'error', message });
    }
  }

  async function handleSavePosition(position: UpsertPositionRequest) {
    if (!currentVersion || !currentTrade) return;

    const existing = currentVersion.positions;
    const idx = existing.findIndex((p) => p.key === position.key);

    const updated: UpsertPositionRequest[] =
      idx >= 0
        ? existing.map((p, i) => (i === idx ? position : positionToRequest(p)))
        : [...existing.map(positionToRequest), position];

    try {
      const saved = await updateCatalogVersion(currentVersion.id, updated);
      setVersions((prev) => ({ ...prev, [currentTrade]: saved }));
      setPositionDialog({ open: false, initial: null });
      setSnack({ severity: 'success', message: t('pricing.positions.saved') });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : t('pricing.positions.saveFailed');
      setSnack({ severity: 'error', message });
    }
  }

  async function handleDeletePosition(key: string) {
    if (!currentVersion || !currentTrade) return;
    const updated = currentVersion.positions
      .filter((p) => p.key !== key)
      .map(positionToRequest);
    try {
      const saved = await updateCatalogVersion(currentVersion.id, updated);
      setVersions((prev) => ({ ...prev, [currentTrade]: saved }));
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : t('app.errors.generic');
      setSnack({ severity: 'error', message });
    }
  }

  async function handlePublish() {
    if (!currentVersion || !currentTrade) return;
    setPublishing(true);
    try {
      const published = await publishCatalogVersion(currentVersion.id);
      setVersions((prev) => ({ ...prev, [currentTrade]: published }));
      setPublishDialog(false);
      setSnack({
        severity: 'success',
        message: t('pricing.draft.publishSuccess'),
      });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : t('pricing.draft.publishFailed');
      setSnack({ severity: 'error', message });
    } finally {
      setPublishing(false);
    }
  }

  async function handleCalculateQuote() {
    if (!currentVersion) return;

    const lines: QuoteLine[] = currentVersion.positions
      .filter((p) => quoteQtys[p.key] && Number(quoteQtys[p.key]) > 0)
      .map((p) => ({
        positionKey: p.key,
        quantity: Number(quoteQtys[p.key]),
      }));

    if (lines.length === 0) return;

    setQuoteLoading(true);
    try {
      const result = await calculateQuote(currentVersion.id, lines);
      setQuoteResult(result);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : t('pricing.quote.failed');
      setSnack({ severity: 'error', message });
    } finally {
      setQuoteLoading(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Stack spacing={2}>
        <Skeleton variant="text" width={240} height={48} />
        <Skeleton variant="rounded" height={48} />
        <Skeleton variant="rounded" height={320} />
      </Stack>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Stack spacing={3}>

      {/* Heading */}
      <Stack spacing={1}>
        <Typography variant="h1">{t('pricing.heading')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t('pricing.subheading')}
        </Typography>
      </Stack>

      {/* Keine Trades */}
      {trades.length === 0 && (
        <Paper sx={{ p: 4 }}>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {t('pricing.tabs.noTrades')}
          </Typography>
        </Paper>
      )}

      {trades.length > 0 && (
        <>
          {/* Tabs pro Trade */}
          <Tabs
            value={selectedTab}
            onChange={(_, v) => {
              setSelectedTab(v);
              setQuoteResult(null);
              setQuoteQtys({});
            }}
          >
            {trades.map((trade: string) => (
              <Tab key={trade} label={trade} />
            ))}
          </Tabs>

          {/* Kein Draft */}
          {!currentVersion && (
            <Paper sx={{ p: 4 }}>
              <Stack spacing={2} alignItems="center">
                <Typography variant="body2" color="text.secondary">
                  {t('pricing.draft.noDraft')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('pricing.draft.createFirst')}
                </Typography>
                <Button variant="contained" onClick={handleCreateDraft}>
                  {t('pricing.draft.newDraft')}
                </Button>
              </Stack>
            </Paper>
          )}

          {/* Katalog-Ansicht */}
          {currentVersion && (
            <Stack spacing={3}>

              {/* Header + Buttons */}
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction="row" spacing={2} alignItems="center">
                  <Typography variant="h2">
                    {t('pricing.positions.heading')}
                  </Typography>
                  <Chip
                    label={currentVersion.status}
                    color={isDraft ? 'warning' : 'success'}
                    size="small"
                  />
                </Stack>
                {isDraft && (
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() =>
                        setPositionDialog({ open: true, initial: null })
                      }
                    >
                      {t('pricing.positions.add')}
                    </Button>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => setPublishDialog(true)}
                      disabled={currentVersion.positions.length === 0}
                    >
                      {t('pricing.draft.publish')}
                    </Button>
                  </Stack>
                )}
              </Stack>

              {/* Positions-Tabelle */}
              {currentVersion.positions.length === 0 ? (
                <Paper sx={{ p: 4 }}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    textAlign="center"
                  >
                    {t('pricing.positions.empty')}
                  </Typography>
                </Paper>
              ) : (
                <TableContainer component={Paper}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{t('pricing.positions.columns.key')}</TableCell>
                        <TableCell>{t('pricing.positions.columns.label')}</TableCell>
                        <TableCell>{t('pricing.positions.columns.unit')}</TableCell>
                        <TableCell align="right">
                          {t('pricing.positions.columns.netPrice')}
                        </TableCell>
                        <TableCell align="right">
                          {t('pricing.positions.columns.vat')}
                        </TableCell>
                        {isDraft && (
                          <TableCell align="right">
                            {t('pricing.positions.columns.actions')}
                          </TableCell>
                        )}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {currentVersion.positions.map((pos) => (
                        <TableRow key={pos.key} hover>
                          <TableCell>
                            <Typography variant="body2" fontFamily="monospace">
                              {pos.key}
                            </Typography>
                          </TableCell>
                          <TableCell>{pos.label}</TableCell>
                          <TableCell>
                            {t(`pricing.positions.units.${pos.unit}` as any)}
                          </TableCell>
                          <TableCell align="right">
                            {formatCents(pos.netPriceMinorUnits)}
                          </TableCell>
                          <TableCell align="right">
                            {(pos.vatRate * 100).toFixed(0)} %
                          </TableCell>
                          {isDraft && (
                            <TableCell align="right">
                              <Tooltip title={t('pricing.positions.edit')}>
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    setPositionDialog({
                                      open: true,
                                      initial: pos,
                                    })
                                  }
                                >
                                  <Edit fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title={t('pricing.positions.delete')}>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => handleDeletePosition(pos.key)}
                                >
                                  <Delete fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              {/* Quote Panel */}
              {currentVersion.positions.length > 0 && (
                <Paper sx={{ p: 3 }}>
                  <Stack spacing={2}>
                    <Typography variant="h3">
                      {t('pricing.quote.heading')}
                    </Typography>

                    {/* Mengen eingeben */}
                    <Stack spacing={1}>
                      {currentVersion.positions.map((pos) => (
                        <Stack
                          key={pos.key}
                          direction="row"
                          spacing={2}
                          alignItems="center"
                        >
                          <Typography variant="body2" sx={{ flex: 1 }}>
                            {pos.label}
                          </Typography>
                          <TextField
                            label={t('pricing.quote.quantity')}
                            type="number"
                            size="small"
                            sx={{ width: 100 }}
                            value={quoteQtys[pos.key] ?? ''}
                            onChange={(e) =>
                              setQuoteQtys((prev) => ({
                                ...prev,
                                [pos.key]: e.target.value,
                              }))
                            }
                            inputProps={{ min: 1 }}
                          />
                        </Stack>
                      ))}
                    </Stack>

                    <Box>
                      <Button
                        variant="outlined"
                        onClick={handleCalculateQuote}
                        disabled={quoteLoading}
                        startIcon={
                          quoteLoading ? (
                            <CircularProgress size={16} />
                          ) : null
                        }
                      >
                        {quoteLoading
                          ? t('pricing.quote.calculating')
                          : t('pricing.quote.calculate')}
                      </Button>
                    </Box>

                    {/* Quote Ergebnis */}
                    {quoteResult && (
                      <Stack spacing={1}>
                        <TableContainer component={Paper} variant="outlined">
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>
                                  {t('pricing.positions.columns.label')}
                                </TableCell>
                                <TableCell align="right">
                                  {t('pricing.quote.quantity')}
                                </TableCell>
                                <TableCell align="right">
                                  {t('pricing.quote.net')}
                                </TableCell>
                                <TableCell align="right">
                                  {t('pricing.quote.vat')}
                                </TableCell>
                                <TableCell align="right">
                                  {t('pricing.quote.gross')}
                                </TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {quoteResult.lines.map((line) => (
                                <TableRow key={line.positionKey}>
                                  <TableCell>{line.label}</TableCell>
                                  <TableCell align="right">
                                    {line.quantity}
                                  </TableCell>
                                  <TableCell align="right">
                                    {formatCents(line.finalNetMinorUnits)}
                                  </TableCell>
                                  <TableCell align="right">
                                    {formatCents(line.vatMinorUnits)}
                                  </TableCell>
                                  <TableCell align="right">
                                    {formatCents(line.grossMinorUnits)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>

                        {/* MwSt-Gruppen */}
                        {quoteResult.vatGroups.map((g) => (
                          <Stack
                            key={g.vatRate}
                            direction="row"
                            justifyContent="space-between"
                          >
                            <Typography variant="body2" color="text.secondary">
                              {t('pricing.quote.vat')}{' '}
                              {(g.vatRate * 100).toFixed(0)}%
                            </Typography>
                            <Typography variant="body2">
                              {formatCents(g.vatMinorUnits)}
                            </Typography>
                          </Stack>
                        ))}

                        {/* Gesamt */}
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          sx={{
                            pt: 1,
                            borderTop: '1px solid',
                            borderColor: 'divider',
                          }}
                        >
                          <Typography variant="body1" fontWeight={600}>
                            {t('pricing.quote.total')}
                          </Typography>
                          <Typography variant="body1" fontWeight={600}>
                            {formatCents(quoteResult.totals.grossMinorUnits)}
                          </Typography>
                        </Stack>
                      </Stack>
                    )}
                  </Stack>
                </Paper>
              )}
            </Stack>
          )}
        </>
      )}

      {/* Position Dialog */}
      <PositionDialog
        open={positionDialog.open}
        initial={positionDialog.initial}
        schemaFields={currentSchema}
        onSave={handleSavePosition}
        onClose={() => setPositionDialog({ open: false, initial: null })}
      />

      {/* Publish Bestätigungs-Dialog */}
      <Dialog open={publishDialog} onClose={() => setPublishDialog(false)}>
        <DialogTitle>{t('pricing.draft.publish')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('pricing.draft.publishConfirm')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPublishDialog(false)} color="inherit">
            Abbrechen
          </Button>
          <Button
            onClick={handlePublish}
            variant="contained"
            disabled={publishing}
            startIcon={publishing ? <CircularProgress size={16} /> : null}
          >
            {publishing
              ? t('pricing.draft.publishing')
              : t('pricing.draft.publish')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={!!snack}
        autoHideDuration={3500}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {snack ? (
          <Alert severity={snack.severity} onClose={() => setSnack(null)}>
            {snack.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Stack>
  );
}