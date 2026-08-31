import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, Button, Card, Col, Row, Spin, Table, Tag, Typography } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import api, { listImages } from "../services/api";
import { formatEasternDateTime } from "../utils/dateFormat";
import { isPositiveFinal } from "../utils/resultDisplay";
import { CATEGORY_COLORS } from "./statisticsCategories";

const { Title, Text } = Typography;

const RECENT_LIMIT = 6;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const TREND_BAR_COLOR = "#1D5FBF";
const TEMP_LINE_COLOR = "#8296A8";

// Result categories in stacked-bar order: negative first, then the positive
// families from light to severe. Unknown categories are appended as-is.
const WORKFLOW_CATEGORY_ORDER = [
  "Negative",
  "Positive",
  "Positive L",
  "Positive I",
  "Positive L+I",
];

const finalResult = (record) => record.manual_correction || record.cv_result;

function parseCreatedAt(value) {
  if (!value) return null;
  // Backend timestamps are UTC without a zone suffix; align with dateFormat.
  const normalized =
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
      ? `${value}Z`
      : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function computeKpis(images) {
  const cutoff = Date.now() - WEEK_MS;
  let week = 0;
  let weekPositive = 0;
  let weekCorrections = 0;
  for (const record of images) {
    const created = parseCreatedAt(record.created_at);
    if (!created || created.getTime() < cutoff) continue;
    week += 1;
    if (isPositiveFinal(finalResult(record))) weekPositive += 1;
    if (record.manual_correction) weekCorrections += 1;
  }
  return {
    total: images.length,
    week,
    weekPositiveRate: week > 0 ? (weekPositive / week) * 100 : 0,
    weekPositive,
    weekCorrections,
  };
}

function KpiCard({ label, value, hint }) {
  return (
    <Card styles={{ body: { padding: "14px 16px" } }}>
      <Text
        type="secondary"
        style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.4 }}
      >
        {label}
      </Text>
      <div
        style={{
          fontFamily: "var(--heading-font)",
          fontWeight: 700,
          fontSize: 26,
          color: "var(--ink-strong)",
          margin: "2px 0",
        }}
      >
        {value}
      </div>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {hint}
      </Text>
    </Card>
  );
}

// Weekly positives with the temperature context as an aligned second panel:
// same x positions, separate y scales, never a dual axis on one plot.
function DashboardTrend({ weeklyTrends }) {
  if (!weeklyTrends?.length) {
    return <Text type="secondary">No weekly trend data yet.</Text>;
  }

  const width = 640;
  const barTop = 12;
  const barBottom = 120;
  const tempTop = 158;
  const tempBottom = 196;
  const height = 214;
  const left = 30;
  const right = 626;
  const step = (right - left) / weeklyTrends.length;

  const totals = weeklyTrends.map((week) =>
    Object.values(week.positive_counts || {}).reduce((sum, n) => sum + n, 0)
  );
  const maxTotal = Math.max(1, ...totals);
  const temps = weeklyTrends
    .map((week) => week.avg_temperature_f)
    .filter((t) => t !== null && t !== undefined);
  const tempMin = temps.length ? Math.min(...temps) - 2 : 0;
  const tempMax = temps.length ? Math.max(...temps) + 2 : 1;

  const xCenter = (i) => left + step * i + step / 2;
  const barY = (count) => barBottom - (count / maxTotal) * (barBottom - barTop);
  const tempY = (t) =>
    tempBottom - ((t - tempMin) / (tempMax - tempMin || 1)) * (tempBottom - tempTop);

  const tempPoints = weeklyTrends
    .map((week, i) => {
      const t = week.avg_temperature_f;
      if (t === null || t === undefined) return null;
      return `${xCenter(i)},${tempY(t)}`;
    })
    .filter(Boolean)
    .join(" ");
  const lastTemp = [...weeklyTrends]
    .reverse()
    .find((week) => week.avg_temperature_f !== null && week.avg_temperature_f !== undefined);

  return (
    <svg
      role="img"
      aria-label="Weekly positive results with Columbus average temperature"
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <text x={left} y={10} fill="var(--ink-secondary)" fontSize="10.5">
        Positive results per week
      </text>
      <line x1={left} x2={right} y1={barBottom} y2={barBottom} stroke="#D5DEE7" />
      {weeklyTrends.map((week, i) => {
        const total = totals[i];
        const y = barY(total);
        return (
          <g key={week.week_start || week.label}>
            <rect
              x={xCenter(i) - Math.min(step * 0.32, 12)}
              y={y}
              width={Math.min(step * 0.64, 24)}
              height={barBottom - y}
              rx="3"
              fill={TREND_BAR_COLOR}
            />
            {i === weeklyTrends.length - 1 && total > 0 && (
              <text
                x={xCenter(i)}
                y={y - 6}
                textAnchor="middle"
                fontSize="11"
                fontWeight="600"
                fill="var(--ink-secondary)"
              >
                {total}
              </text>
            )}
            <text
              x={xCenter(i)}
              y={barBottom + 16}
              textAnchor="middle"
              fontSize="10"
              fill="var(--ink-secondary)"
            >
              {week.label}
            </text>
          </g>
        );
      })}

      {tempPoints && (
        <>
          <text x={left} y={tempTop - 8} fill="var(--ink-secondary)" fontSize="10.5">
            Avg temp, Columbus
          </text>
          <polyline
            points={tempPoints}
            fill="none"
            stroke={TEMP_LINE_COLOR}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {lastTemp && (
            <text
              x={right}
              y={tempY(lastTemp.avg_temperature_f) - 6}
              textAnchor="end"
              fontSize="10.5"
              fill="var(--ink-secondary)"
            >
              {Math.round(lastTemp.avg_temperature_f)}°F
            </text>
          )}
        </>
      )}
    </svg>
  );
}

// Horizontal segmented bar of final results for one workflow.
function WorkflowBar({ label, counts }) {
  const ordered = WORKFLOW_CATEGORY_ORDER.filter((cat) => counts[cat]);
  const extras = Object.keys(counts).filter(
    (cat) => !WORKFLOW_CATEGORY_ORDER.includes(cat)
  );
  const categories = [...ordered, ...extras];
  const total = categories.reduce((sum, cat) => sum + counts[cat], 0);
  if (total === 0) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
        }}
      >
        <Text strong style={{ fontSize: 13 }}>
          {label}
        </Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {total} samples
        </Text>
      </div>
      <div style={{ display: "flex", gap: 2, height: 18 }}>
        {categories.map((cat) => (
          <div
            key={cat}
            style={{
              flex: counts[cat],
              background: CATEGORY_COLORS[cat] || "#94A3B8",
              borderRadius: 3,
            }}
            title={`${cat}: ${counts[cat]}`}
          />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          marginTop: 6,
          fontSize: 11.5,
          color: "var(--ink-secondary)",
        }}
      >
        {categories.map((cat) => (
          <span
            key={cat}
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 2,
                background: CATEGORY_COLORS[cat] || "#94A3B8",
                display: "inline-block",
              }}
            />
            {cat} {Math.round((counts[cat] / total) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ClinicDashboard() {
  const navigate = useNavigate();
  const [images, setImages] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([listImages(), api.get("/api/stats/global")])
      .then(([imagesRes, statsRes]) => {
        if (cancelled) return;
        setImages(imagesRes.data);
        setStats(statsRes.data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.response?.data?.detail || "Failed to load dashboard");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const kpis = useMemo(() => (images ? computeKpis(images) : null), [images]);

  // dimensions.disease_category maps category -> workflow -> count; invert it
  // into workflow -> category -> count for the segmented bars.
  const workflowCounts = useMemo(() => {
    const byCategory = stats?.dimensions?.disease_category;
    if (!byCategory) return {};
    const result = {};
    for (const [category, byWorkflow] of Object.entries(byCategory)) {
      for (const [workflow, count] of Object.entries(byWorkflow)) {
        if (!result[workflow]) result[workflow] = {};
        result[workflow][category] = count;
      }
    }
    return result;
  }, [stats]);

  if (error) {
    return <Alert type="error" message={error} showIcon />;
  }

  if (!images || !stats || !kpis) {
    return (
      <div style={{ textAlign: "center", padding: "4rem" }}>
        <Spin size="large" />
      </div>
    );
  }

  const recentColumns = [
    {
      title: "Date",
      dataIndex: "created_at",
      width: 190,
      render: (v) => formatEasternDateTime(v),
      responsive: ["md"],
    },
    { title: "Filename", dataIndex: "original_filename", ellipsis: true },
    {
      title: "Workflow",
      dataIndex: "disease_category",
      width: 130,
      render: (d) => d || "--",
      responsive: ["md"],
    },
    {
      title: "Result",
      width: 250,
      render: (_, record) => {
        const final = finalResult(record);
        if (!final) return <Tag color="gold">Pending</Tag>;
        // Tick Borne summaries can list several analytes; wrap inside the
        // cell instead of overflowing into the neighboring columns.
        return (
          <Tag
            color={isPositiveFinal(final) ? "red" : "green"}
            style={{ whiteSpace: "normal", margin: 0 }}
          >
            {final}
          </Tag>
        );
      },
    },
    {
      title: "By",
      dataIndex: "username",
      width: 110,
      render: (u) => u || "Unknown",
      responsive: ["lg"],
    },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0, color: "var(--ink-strong)" }}>
            Dashboard
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            All workflows, live from submitted readings
          </Text>
        </div>
        <Link to="/clinic/new">
          <Button type="primary" icon={<PlusOutlined />}>
            New Test
          </Button>
        </Link>
      </div>

      <Row gutter={[14, 14]} style={{ marginBottom: 18 }}>
        <Col xs={12} lg={6}>
          <KpiCard
            label="TOTAL SAMPLES"
            value={kpis.total}
            hint="all submissions"
          />
        </Col>
        <Col xs={12} lg={6}>
          <KpiCard
            label="SAMPLES · 7D"
            value={kpis.week}
            hint="last 7 days"
          />
        </Col>
        <Col xs={12} lg={6}>
          <KpiCard
            label="POSITIVE RATE · 7D"
            value={`${kpis.weekPositiveRate.toFixed(1)}%`}
            hint={`${kpis.weekPositive} of ${kpis.week} samples`}
          />
        </Col>
        <Col xs={12} lg={6}>
          <KpiCard
            label="CORRECTIONS · 7D"
            value={kpis.weekCorrections}
            hint="manually corrected"
          />
        </Col>
      </Row>

      <Row gutter={[14, 14]} style={{ marginBottom: 18 }}>
        <Col xs={24} lg={15}>
          <Card
            title="Weekly positive results"
            styles={{ body: { padding: "12px 16px" } }}
          >
            <DashboardTrend weeklyTrends={stats.weekly_trends} />
            {stats.temperature_error && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {stats.temperature_error}
              </Text>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={9}>
          <Card
            title="Results by workflow"
            styles={{ body: { padding: "14px 16px 6px" } }}
          >
            {Object.keys(workflowCounts).length === 0 ? (
              <Text type="secondary">No categorized results yet.</Text>
            ) : (
              Object.entries(workflowCounts).map(([workflow, counts]) => (
                <WorkflowBar key={workflow} label={workflow} counts={counts} />
              ))
            )}
            <Text
              type="secondary"
              style={{ fontSize: 11.5, display: "block", margin: "4px 0 10px" }}
            >
              Share of final results after manual corrections.
            </Text>
          </Card>
        </Col>
      </Row>

      <Card
        title="Recent submissions"
        extra={<Link to="/clinic/submissions">Open submissions</Link>}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          columns={recentColumns}
          dataSource={images.slice(0, RECENT_LIMIT)}
          rowKey="id"
          pagination={false}
          size="middle"
          onRow={(record) => ({
            onClick: () => navigate(`/results?image=${record.id}`),
            style: { cursor: "pointer" },
          })}
        />
      </Card>
    </div>
  );
}
