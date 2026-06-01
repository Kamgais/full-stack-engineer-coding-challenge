import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
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
import { Delete, Edit, ExpandLess, ExpandMore } from '@mui/icons-material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../services/api.service';
import { fetchCraftsman } from '../services/craftsmen.service';
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

interface VersionRowProps {
  version: CatalogVersion;
  schemaFields: PricingSchemaField[];
  isExpanded: boolean;
  isLatestPublished: boolean;
  onToggle: () => void;
  onVersionUpdated: (v: CatalogVersion) => void;
  onSnack: (severity: 'success' | 'error', message: string) => void;
}

function VersionRow({
  version,
  schemaFields,
  isExpanded,
  isLatestPublished,
  onToggle,
  onVersionUpdated,
  onSnack,
}: VersionRowProps): JSX.Element {
  const { t } = useTranslation();
  const isDraft = version.status === 'DRAFT';
  const isArchived = version.status === 'PUBLISHED' && !isLatestPublished;

  const [positionDialog, setPositionDialog] = useState<{
    open: boolean;
    initial: CatalogPosition | null;
  }>({ open: false, initial: null });
  const [publishDialog, setPublishDialog] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [quoteQtys, setQuoteQtys] = useState<Record<string, string>>({});
  const [quoteResult, setQuoteResult] = useState<QuoteResult | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  async function handleSavePosition(position: UpsertPositionRequest) {
    const existing = version.positions;
    const idx = existing.findIndex((p) => p.key === position.key);
    const updated: UpsertPositionRequest[] =
      idx >= 0
        ? existing.map((p, i) => (i === idx ? position : positionToRequest(p)))
        : [...existing.map(positionToRequest), position];

    try {
      const saved = await updateCatalogVersion(version.id, updated);
      onVersionUpdated(saved);
      setPositionDialog({ open: false, initial: null });
      onSnack('success', t('pricing.positions.saved'));
    } catch (err) {
      onSnack(
        'error',
        err instanceof ApiError ? err.message : t('pricing.positions.saveFailed'),
      );
    }
  }

  async function handleDeletePosition(key: string) {
    const updated = version.positions
      .filter((p) => p.key !== key)
      .map(positionToRequest);
    try {
      const saved = await updateCatalogVersion(version.id, updated);
      onVersionUpdated(saved);
    } catch (err) {
      onSnack(
        'error',
        err instanceof ApiError ? err.message : t('app.errors.generic'),
      );
    }
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      const published = await publishCatalogVersion(version.id);
      onVersionUpdated(published);
      setPublishDialog(false);
      onSnack('success', t('pricing.draft.publishSuccess'));
    } catch (err) {
      onSnack(
        'error',
        err instanceof ApiError ? err.message : t('pricing.draft.publishFailed'),
      );
    } finally {
      setPublishing(false);
    }
  }

  async function handleCalculateQuote() {
    const lines: QuoteLine[] = version.positions
      .filter((p) => quoteQtys[p.key] && Number(quoteQtys[p.key]) > 0)
      .map((p) => ({
        positionKey: p.key,
        quantity: Number(quoteQtys[p.key]),
      }));

    if (lines.length === 0) {
      setQuoteError(t('pricing.quote.emptyQty'));
      return;
    }

    setQuoteLoading(true);
    setQuoteError(null);
    setQuoteResult(null);

    try {
      const result = await calculateQuote(version.id, lines);
      setQuoteResult(result);
    } catch (err) {
      setQuoteError(
        err instanceof ApiError ? err.message : t('pricing.quote.failed'),
      );
    } finally {
      setQuoteLoading(false);
    }
  }

  return (
    <>
      <TableRow hover onClick={onToggle} sx={{ cursor: 'pointer' }}>
        <TableCell>
          <Stack direction="row" spacing={1} alignItems="center">
            {isExpanded ? (
              <ExpandLess fontSize="small" />
            ) : (
              <ExpandMore fontSize="small" />
            )}
            <Typography variant="body2">
              {new Date(version.effectiveFrom).toLocaleDateString('de-DE')}
            </Typography>
          </Stack>
        </TableCell>

        <TableCell>
          <Stack direction="row" spacing={1}>
            {isDraft && (
              <Chip
                label={t('pricing.versions.statusLabels.draft')}
                color="warning"
                size="small"
              />
            )}
            {version.status === 'PUBLISHED' && isLatestPublished && (
              <Chip
                label={t('pricing.versions.statusLabels.active')}
                color="success"
                size="small"
              />
            )}
            {isArchived && (
              <Chip
                label={t('pricing.versions.statusLabels.archived')}
                color="default"
                size="small"
                variant="outlined"
              />
            )}
          </Stack>
        </TableCell>

        <TableCell>
          <Typography variant="body2" color="text.secondary">
            {t('pricing.versions.positionsCount', {
              count: version.positions.length,
            })}
          </Typography>
        </TableCell>

        <TableCell>
          <Typography variant="body2" color="text.secondary">
            {version.publishedBy
              ? `${version.publishedBy} — ${new Date(
                  version.publishedAt!,
                ).toLocaleDateString('de-DE')}`
              : '—'}
          </Typography>
        </TableCell>
      </TableRow>

      <TableRow>
        <TableCell colSpan={4} sx={{ p: 0, border: 0 }}>
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            <Box sx={{ p: 3, bgcolor: 'background.default' }}>
              <Stack spacing={3}>

                {isArchived && (
                  <Alert severity="info">
                    {t('pricing.versions.archivedHint')}
                  </Alert>
                )}

                {version.status === 'PUBLISHED' && isLatestPublished && (
                  <Alert severity="success">
                    {t('pricing.versions.activeHint')}
                  </Alert>
                )}

                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Typography variant="h3">
                    {t('pricing.positions.heading')}
                  </Typography>
                  {isDraft && (
                    <Stack direction="row" spacing={1}>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPositionDialog({ open: true, initial: null });
                        }}
                      >
                        {t('pricing.positions.add')}
                      </Button>
                      <Button
                        variant="contained"
                        size="small"
                        color="success"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPublishDialog(true);
                        }}
                        disabled={version.positions.length === 0}
                      >
                        {t('pricing.draft.publish')}
                      </Button>
                    </Stack>
                  )}
                </Stack>

                {version.positions.length === 0 ? (
                  <Paper variant="outlined" sx={{ p: 3 }}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      textAlign="center"
                    >
                      {t('pricing.positions.empty')}
                    </Typography>
                  </Paper>
                ) : (
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>
                            {t('pricing.positions.columns.key')}
                          </TableCell>
                          <TableCell>
                            {t('pricing.positions.columns.label')}
                          </TableCell>
                          <TableCell>
                            {t('pricing.positions.columns.unit')}
                          </TableCell>
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
                        {version.positions.map((pos) => (
                          <TableRow key={pos.key} hover>
                            <TableCell>
                              <Typography
                                variant="body2"
                                fontFamily="monospace"
                              >
                                {pos.key}
                              </Typography>
                            </TableCell>
                            <TableCell>{pos.label}</TableCell>
                            <TableCell>
                              {t(
                                `pricing.positions.units.${pos.unit}` as any,
                              )}
                            </TableCell>
                            <TableCell align="right">
                              {formatCents(pos.netPriceMinorUnits)}
                            </TableCell>
                            <TableCell align="right">
                              {(pos.vatRate * 100).toFixed(0)} %
                            </TableCell>
                            {isDraft && (
                              <TableCell align="right">
                                <Tooltip
                                  title={t('pricing.positions.edit')}
                                >
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPositionDialog({
                                        open: true,
                                        initial: pos,
                                      });
                                    }}
                                  >
                                    <Edit fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip
                                  title={t('pricing.positions.delete')}
                                >
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeletePosition(pos.key);
                                    }}
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

                {version.positions.length > 0 && (
                  <Paper variant="outlined" sx={{ p: 3 }}>
                    <Stack spacing={2}>
                      <Typography variant="h3">
                        {t('pricing.quote.heading')}
                      </Typography>

                      <Stack spacing={1}>
                        {version.positions.map((pos) => (
                          <Stack
                            key={pos.key}
                            direction="row"
                            spacing={2}
                            alignItems="center"
                          >
                            <Stack sx={{ flex: 1 }}>
                              <Typography variant="body2">
                                {pos.label}
                              </Typography>
                              {(pos.minQuantity || pos.maxQuantity) && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  {pos.minQuantity && `Min: ${pos.minQuantity}`}
                                  {pos.minQuantity && pos.maxQuantity && ' — '}
                                  {pos.maxQuantity && `Max: ${pos.maxQuantity}`}
                                </Typography>
                              )}
                            </Stack>
                            <TextField
                              label={t('pricing.quote.quantity')}
                              type="number"
                              size="small"
                              sx={{ width: 120 }}
                              value={quoteQtys[pos.key] ?? ''}
                              onChange={(e) => {
                                setQuoteQtys((prev) => ({
                                  ...prev,
                                  [pos.key]: e.target.value,
                                }));
                                setQuoteError(null);
                              }}
                              inputProps={{
                                min: pos.minQuantity ?? 1,
                                max: pos.maxQuantity ?? undefined,
                              }}
                              helperText={
                                pos.minQuantity
                                  ? `Min. ${pos.minQuantity}`
                                  : undefined
                              }
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

                      {quoteError && (
                        <Alert
                          severity="error"
                          onClose={() => setQuoteError(null)}
                        >
                          {quoteError}
                        </Alert>
                      )}

                      {quoteResult && (
                        <Stack spacing={1}>
                          <TableContainer
                            component={Paper}
                            variant="outlined"
                          >
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

                          {quoteResult.vatGroups.map((g) => (
                            <Stack
                              key={g.vatRate}
                              direction="row"
                              justifyContent="space-between"
                            >
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                {t('pricing.quote.vat')}{' '}
                                {(g.vatRate * 100).toFixed(0)}%
                              </Typography>
                              <Typography variant="body2">
                                {formatCents(g.vatMinorUnits)}
                              </Typography>
                            </Stack>
                          ))}

                          {quoteResult.totals.discountsTotalMinorUnits > 0 && (
                            <Stack
                              direction="row"
                              justifyContent="space-between"
                            >
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                {t('pricing.quote.discounts')}
                              </Typography>
                              <Typography variant="body2" color="error">
                                -{formatCents(
                                  quoteResult.totals.discountsTotalMinorUnits,
                                )}
                              </Typography>
                            </Stack>
                          )}

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
                              {formatCents(
                                quoteResult.totals.grossMinorUnits,
                              )}
                            </Typography>
                          </Stack>
                        </Stack>
                      )}
                    </Stack>
                  </Paper>
                )}
              </Stack>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>

      <PositionDialog
        open={positionDialog.open}
        initial={positionDialog.initial}
        schemaFields={schemaFields}
        onSave={handleSavePosition}
        onClose={() => setPositionDialog({ open: false, initial: null })}
      />

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
    </>
  );
}

export function PricingCatalogPage(): JSX.Element {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [trades, setTrades] = useState<string[]>([]);
  const [selectedTab, setSelectedTab] = useState(0);
  const [versions, setVersions] = useState<Record<string, CatalogVersion[]>>({});
  const [schemaFields, setSchemaFields] = useState<Record<string, PricingSchemaField[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [snack, setSnack] = useState<{
    severity: 'success' | 'error';
    message: string;
  } | null>(null);

  const currentTrade = trades[selectedTab] as string | undefined;
  const currentVersions = currentTrade ? (versions[currentTrade] ?? []) : [];
  const currentSchema = currentTrade ? (schemaFields[currentTrade] ?? []) : [];
  const hasDraft = currentVersions.some((v) => v.status === 'DRAFT');

  const latestPublished = currentVersions
    .filter((v) => v.status === 'PUBLISHED')
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];

  useEffect(() => {
    if (!user?.craftsmanId) {
      setLoading(false);
      return;
    }

    fetchCraftsman(user.craftsmanId)
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

            return {
              trade,
              versions: tradeVersions.sort((a, b) =>
                b.effectiveFrom.localeCompare(a.effectiveFrom),
              ),
              schema: tradeConfig.pricingSchema?.fields ?? [],
            };
          }),
        ).then((results) => {
          const vMap: Record<string, CatalogVersion[]> = {};
          const sMap: Record<string, PricingSchemaField[]> = {};
          results.forEach(({ trade, versions: v, schema }) => {
            vMap[trade] = v;
            sMap[trade] = schema;
          });
          setVersions(vMap);
          setSchemaFields(sMap);
        });
      })
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError ? err.message : t('app.errors.generic'),
        );
      })
      .finally(() => setLoading(false));
  }, [user, t]);

  async function handleCreateDraft(sourceVersionId?: string) {
    if (!currentTrade) return;
    setCreatingDraft(true);
    try {
      const version = await createCatalogVersion(
        currentTrade,
        new Date().toISOString(),
        sourceVersionId,
      );
      setVersions((prev) => ({
        ...prev,
        [currentTrade]: [version, ...(prev[currentTrade] ?? [])],
      }));
      setExpandedVersionId(version.id);
    } catch (err) {
      setSnack({
        severity: 'error',
        message:
          err instanceof ApiError ? err.message : t('app.errors.generic'),
      });
    } finally {
      setCreatingDraft(false);
    }
  }

  function handleVersionUpdated(updated: CatalogVersion) {
    if (!currentTrade) return;
    setVersions((prev) => ({
      ...prev,
      [currentTrade]: (prev[currentTrade] ?? []).map((v) =>
        v.id === updated.id ? updated : v,
      ),
    }));
  }

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
      <Stack spacing={1}>
        <Typography variant="h1">{t('pricing.heading')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t('pricing.subheading')}
        </Typography>
      </Stack>

      {trades.length === 0 && (
        <Paper sx={{ p: 4 }}>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {t('pricing.tabs.noTrades')}
          </Typography>
        </Paper>
      )}

      {trades.length > 0 && (
        <>
          <Tabs
            value={selectedTab}
            onChange={(_, v) => {
              setSelectedTab(v);
              setExpandedVersionId(null);
            }}
          >
            {trades.map((trade: string) => (
              <Tab key={trade} label={trade} />
            ))}
          </Tabs>

          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Typography variant="h2">
              {t('pricing.draft.heading')}
            </Typography>

            {/* Buttons nur wenn kein DRAFT existiert */}
            {!hasDraft && (
              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => handleCreateDraft()}
                  disabled={creatingDraft}
                  startIcon={
                    creatingDraft ? <CircularProgress size={16} /> : null
                  }
                >
                  {t('pricing.draft.newDraftEmpty')}
                </Button>

                {/* Nur wenn aktive PUBLISHED Version existiert */}
                {latestPublished && (
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => handleCreateDraft(latestPublished.id)}
                    disabled={creatingDraft}
                    startIcon={
                      creatingDraft ? <CircularProgress size={16} /> : null
                    }
                  >
                    {t('pricing.draft.newDraftFromActive')}
                  </Button>
                )}
              </Stack>
            )}

            {/* Deaktivierter Button wenn DRAFT existiert */}
            {hasDraft && (
              <Tooltip title={t('pricing.versions.tooltipDraftExists')}>
                <span>
                  <Button variant="contained" size="small" disabled>
                    {t('pricing.draft.newDraft')}
                  </Button>
                </span>
              </Tooltip>
            )}
          </Stack>

          {hasDraft && (
            <Alert severity="info">
              {t('pricing.versions.hasDraftHint')}
            </Alert>
          )}

          {currentVersions.length === 0 ? (
            <Paper sx={{ p: 4 }}>
              <Typography
                variant="body2"
                color="text.secondary"
                textAlign="center"
              >
                {t('pricing.draft.noDraft')} {t('pricing.draft.createFirst')}
              </Typography>
            </Paper>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>
                      {t('pricing.versions.columns.effectiveFrom')}
                    </TableCell>
                    <TableCell>
                      {t('pricing.versions.columns.status')}
                    </TableCell>
                    <TableCell>
                      {t('pricing.versions.columns.positions')}
                    </TableCell>
                    <TableCell>
                      {t('pricing.versions.columns.publishedBy')}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {currentVersions.map((version) => (
                    <VersionRow
                      key={version.id}
                      version={version}
                      schemaFields={currentSchema}
                      isExpanded={expandedVersionId === version.id}
                      isLatestPublished={
                        version.status === 'PUBLISHED' &&
                        version.id === latestPublished?.id
                      }
                      onToggle={() =>
                        setExpandedVersionId((prev) =>
                          prev === version.id ? null : version.id,
                        )
                      }
                      onVersionUpdated={handleVersionUpdated}
                      onSnack={(severity, message) =>
                        setSnack({ severity, message })
                      }
                    />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

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