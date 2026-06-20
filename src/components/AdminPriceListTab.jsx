import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { useLang } from "../i18n.jsx";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import { canManage } from "../lib/permissions.js";
import {
  listPriceListVersions,
  createPriceListVersion,
  updatePriceListItem,
  itemsToMatrix,
  PRODUCT_CATEGORIES,
} from "../lib/priceList.js";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
} from "./ui/ds/index.js";

function productLabel(t, code) {
  const key = `priceProduct_${code}`;
  const label = t(key);
  return label !== key ? label : code;
}

function tierLabel(t, tier) {
  const key = `tier_${tier}`;
  const label = t(key);
  return label !== key ? label : tier;
}

export default function AdminPriceListTab({ toast, profile }) {
  const { t } = useLang();
  const isDesktop = useIsDesktop();
  const canEdit = canManage(profile);

  const [versions, setVersions] = useState([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [matrix, setMatrix] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingCell, setSavingCell] = useState(null);
  const [showNewVersion, setShowNewVersion] = useState(false);
  const [newEffectiveFrom, setNewEffectiveFrom] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [creatingVersion, setCreatingVersion] = useState(false);

  const loadVersions = useCallback(async () => {
    const rows = await listPriceListVersions();
    setVersions(rows);
    if (rows.length && !selectedVersionId) {
      setSelectedVersionId(rows[0].id);
    }
    return rows;
  }, [selectedVersionId]);

  const loadVersionItems = useCallback(async (versionId) => {
    if (!versionId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("price_list_items")
        .select("product_code, tier, amount")
        .eq("version_id", versionId);
      if (error) throw error;
      setMatrix(itemsToMatrix(data || []));
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setLoading(false);
  }, [toast, t]);

  useEffect(() => {
    loadVersions().catch((e) => toast.show(e.message));
  }, []);

  useEffect(() => {
    if (selectedVersionId) loadVersionItems(selectedVersionId);
  }, [selectedVersionId, loadVersionItems]);

  const handleCellSave = async (productCode, tier, value) => {
    if (!canEdit) return;
    const key = `${productCode}_${tier}`;
    setSavingCell(key);
    try {
      await updatePriceListItem(selectedVersionId, productCode, tier, value);
      setMatrix((prev) => ({
        ...prev,
        [productCode]: { ...prev[productCode], [tier]: Number(value) },
      }));
      toast.show(t("priceListSaved"));
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setSavingCell(null);
  };

  const handleCreateVersion = async () => {
    if (!newEffectiveFrom || !newLabel.trim()) {
      return toast.show(t("priceListVersionRequired"));
    }
    setCreatingVersion(true);
    try {
      const result = await createPriceListVersion(newEffectiveFrom, newLabel.trim());
      await loadVersions();
      setSelectedVersionId(result.version_id);
      setShowNewVersion(false);
      setNewEffectiveFrom("");
      setNewLabel("");
      toast.show(t("priceListVersionCreated"));
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setCreatingVersion(false);
  };

  const renderCategory = (titleKey, codes) => (
    <Card key={titleKey} style={{ marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>{t(titleKey)}</h3>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="col-text">{t("priceListProduct")}</th>
              <th className="col-num">{tierLabel(t, "external")}</th>
              <th className="col-num">{tierLabel(t, "subscriber")}</th>
              <th className="col-num">{tierLabel(t, "shareholder")}</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((code) => (
              <tr key={code}>
                <td className="col-text">{productLabel(t, code)}</td>
                {["external", "subscriber", "shareholder"].map((tier) => {
                  const cellKey = `${code}_${tier}`;
                  const val = matrix[code]?.[tier];
                  return (
                    <td className="col-num" key={tier}>
                      {canEdit ? (
                        <Input
                          type="number"
                          dir="ltr"
                          style={{ width: 88, textAlign: "center" }}
                          value={val ?? ""}
                          onBlur={(e) => {
                            const next = e.target.value;
                            if (next !== "" && Number(next) !== val) {
                              handleCellSave(code, tier, next);
                            }
                          }}
                          onChange={(e) => {
                            setMatrix((prev) => ({
                              ...prev,
                              [code]: { ...prev[code], [tier]: e.target.value === "" ? null : Number(e.target.value) },
                            }));
                          }}
                          disabled={savingCell === cellKey}
                        />
                      ) : (
                        <span dir="ltr">{val != null ? `₪${val}` : "—"}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );

  return (
    <div>
      {!isDesktop && (
        <div className="page-header">
          <h1 className="page-title">{t("tabPriceList")}</h1>
        </div>
      )}

      <p className="schedule-session-hint" style={{ marginBottom: 12 }}>
        {canEdit ? t("priceListSubAdmin") : t("priceListSubOffice")}
      </p>

      <div className="filter-bar" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16, alignItems: "flex-end" }}>
        <Field label={t("priceListVersion")} style={{ marginBottom: 0, minWidth: 200 }}>
          <Select value={selectedVersionId} onChange={(e) => setSelectedVersionId(e.target.value)}>
            <option value="">{t("selectOption")}</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} ({v.effective_from})
              </option>
            ))}
          </Select>
        </Field>
        {canEdit && (
          <Button size="sm" variant="primary" onClick={() => setShowNewVersion(true)}>
            {t("priceListNewVersion")}
          </Button>
        )}
      </div>

      {showNewVersion && canEdit && (
        <Card style={{ marginBottom: 16 }}>
          <Field label={t("priceListEffectiveFrom")}>
            <Input type="date" dir="ltr" value={newEffectiveFrom} onChange={(e) => setNewEffectiveFrom(e.target.value)} />
          </Field>
          <Field label={t("priceListVersionLabel")}>
            <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder={t("priceListVersionLabelPlaceholder")} />
          </Field>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="primary" onClick={handleCreateVersion} disabled={creatingVersion}>
              {creatingVersion ? <Spinner size={14} /> : t("priceListCreateVersion")}
            </Button>
            <Button variant="secondary" onClick={() => setShowNewVersion(false)}>{t("cancel")}</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 32 }}><Spinner /></div>
      ) : !selectedVersionId ? (
        <EmptyState title={t("priceListEmpty")} />
      ) : (
        <>
          {renderCategory("priceListCategoryCourse", PRODUCT_CATEGORIES.course)}
          {renderCategory("priceListCategoryAnnual", PRODUCT_CATEGORIES.annual)}
          {renderCategory("priceListCategoryPrivate", PRODUCT_CATEGORIES.private)}
          {renderCategory("priceListCategoryOther", PRODUCT_CATEGORIES.other)}
        </>
      )}
    </div>
  );
}
