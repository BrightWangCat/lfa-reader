import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  Row,
  Col,
  Card,
  Statistic,
  Table,
  Progress,
  Typography,
  Space,
  Button,
  Spin,
  Alert,
  Empty,
} from "antd";
import {
  DownloadOutlined,
  EyeOutlined,
  ArrowLeftOutlined,
} from "@ant-design/icons";
import api, { API_BASE_URL } from "../services/api";

const { Title, Text } = Typography;

export default function Stats() {
  const [searchParams] = useSearchParams();
  const batchId = searchParams.get("batch");

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!batchId) {
      setError("No batch specified");
      setLoading(false);
      return;
    }
    fetchStats();
  }, [batchId]);

  const fetchStats = async () => {
    try {
      const res = await api.get(`/api/stats/batch/${batchId}`);
      setStats(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load statistics");
    } finally {
      setLoading(false);
    }
  };

  const pct = (count, total) => {
    if (!total) return "0%";
    return `${((count / total) * 100).toFixed(1)}%`;
  };

  const pctNum = (count, total) => {
    if (!total) return 0;
    return parseFloat(((count / total) * 100).toFixed(1));
  };

  const formatMetric = (value) => {
    if (value === null || value === undefined) return "N/A";
    return `${(value * 100).toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "4rem" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: "center", padding: "4rem" }}>
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ maxWidth: 400, margin: "0 auto 16px" }}
        />
        <Link to="/history">
          <Button icon={<ArrowLeftOutlined />}>Back to Results</Button>
        </Link>
      </div>
    );
  }

  if (!stats) return null;

  const dist = stats.distribution.final || {};
  const coverage = stats.reading_coverage;
  const aiComparison = stats.ai_comparison;
  const cvComparison = stats.cv_comparison;

  // Prepare distribution table data
  const distData = Object.entries(dist)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({ key: category, category, count }));

  // Distribution table columns
  const distColumns = [
    { title: "Category", dataIndex: "category", key: "category", width: 200 },
    {
      title: "Count",
      dataIndex: "count",
      key: "count",
      width: 80,
      align: "center",
    },
    {
      title: "Distribution",
      key: "bar",
      render: (_, record) => (
        <Progress
          percent={pctNum(record.count, stats.total_images)}
          showInfo={false}
          strokeColor="#2b6cb0"
          size="small"
        />
      ),
    },
    {
      title: "Percent",
      key: "pct",
      width: 80,
      align: "right",
      render: (_, record) => (
        <Text type="secondary">{pct(record.count, stats.total_images)}</Text>
      ),
    },
  ];

  // Per-category metrics table columns
  const metricsColumns = [
    { title: "Category", dataIndex: "category", key: "category" },
    {
      title: "Precision",
      dataIndex: "precision",
      key: "precision",
      width: 100,
      align: "center",
      render: (v) => formatMetric(v),
    },
    {
      title: "Recall",
      dataIndex: "recall",
      key: "recall",
      width: 100,
      align: "center",
      render: (v) => formatMetric(v),
    },
    {
      title: "F1-Score",
      dataIndex: "f1_score",
      key: "f1_score",
      width: 100,
      align: "center",
      render: (v) => formatMetric(v),
    },
    {
      title: "Support",
      dataIndex: "support",
      key: "support",
      width: 80,
      align: "center",
    },
  ];

  // Helper to build a distribution table for patient summary sections
  const buildPatientDistTable = (data, total, labelName) => {
    const tableData = Object.entries(data)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ key: name, name, count }));
    const cols = [
      { title: labelName, dataIndex: "name", key: "name", width: 200 },
      {
        title: "Count",
        dataIndex: "count",
        key: "count",
        width: 80,
        align: "center",
      },
      {
        title: "Distribution",
        key: "bar",
        render: (_, record) => (
          <Progress
            percent={pctNum(record.count, total)}
            showInfo={false}
            strokeColor="#2b6cb0"
            size="small"
          />
        ),
      },
      {
        title: "Percent",
        key: "pct",
        width: 80,
        align: "right",
        render: (_, record) => (
          <Text type="secondary">{pct(record.count, total)}</Text>
        ),
      },
    ];
    return (
      <Table
        columns={cols}
        dataSource={tableData}
        pagination={false}
        size="small"
        scroll={{ x: 400 }}
      />
    );
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 32,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <Title level={3} style={{ color: "#1a365d", margin: 0 }}>
            Batch Statistics
          </Title>
          <Text type="secondary">
            {stats.batch_name && (
              <Text strong style={{ marginRight: 8 }}>
                {stats.batch_name}
              </Text>
            )}
            {stats.total_images} image{stats.total_images !== 1 ? "s" : ""}
          </Text>
        </div>
        <Space wrap>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            style={{ background: "#276749", borderColor: "#276749" }}
            href={`${API_BASE_URL}/api/export/batch/${batchId}/excel?token=${localStorage.getItem("token")}`}
          >
            Export Report
          </Button>
          <Link to={`/results?batch=${batchId}`}>
            <Button icon={<EyeOutlined />}>View Results</Button>
          </Link>
          <Link to="/history">
            <Button icon={<ArrowLeftOutlined />}>Back to Results</Button>
          </Link>
        </Space>
      </div>

      {/* Reading Coverage */}
      <Title level={5} style={{ color: "#1a365d", marginBottom: 16 }}>
        Reading Coverage
      </Title>
      <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
        <Col xs={12} sm={6} md={4}>
          <Card>
            <Statistic title="Total Images" value={stats.total_images} />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card>
            <Statistic title="AI Read" value={coverage.ai_read} />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card>
            <Statistic title="CV Read" value={coverage.cv_read} />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card>
            <Statistic
              title="Manually Corrected"
              value={coverage.manually_corrected}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card>
            <Statistic title="Unclassified" value={coverage.unclassified} />
          </Card>
        </Col>
      </Row>

      {/* Classification Distribution */}
      <Title level={5} style={{ color: "#1a365d", marginBottom: 16 }}>
        Classification Distribution
      </Title>
      {Object.keys(dist).length === 0 ? (
        <Empty
          description="No classifications yet. Use Manual Correct on the Results page to classify images."
          style={{ marginBottom: 32 }}
        />
      ) : (
        <Table
          columns={distColumns}
          dataSource={distData}
          pagination={false}
          size="small"
          scroll={{ x: 400 }}
          style={{ marginBottom: 32 }}
        />
      )}

      {/* AI vs Manual Comparison */}
      {aiComparison && (
        <ComparisonSection
          title="AI vs Manual Comparison"
          comparison={aiComparison}
          methodLabel="AI"
          accentColor="#2b6cb0"
          metricsColumns={metricsColumns}
          formatMetric={formatMetric}
        />
      )}

      {/* CV vs Manual Comparison */}
      {cvComparison && (
        <ComparisonSection
          title="CV vs Manual Comparison"
          comparison={cvComparison}
          methodLabel="CV"
          accentColor="#276749"
          metricsColumns={metricsColumns}
          formatMetric={formatMetric}
        />
      )}

      {/* Patient Information Summary */}
      {stats.patient_summary &&
        stats.patient_summary.total_with_patient_info > 0 && (
          <>
            <Title level={5} style={{ color: "#1a365d", marginBottom: 16 }}>
              Patient Information Summary
            </Title>
            <Text style={{ display: "block", marginBottom: 20 }}>
              {stats.patient_summary.total_with_patient_info} of{" "}
              {stats.total_images} image
              {stats.total_images !== 1 ? "s" : ""} have patient information
            </Text>

            {Object.keys(stats.patient_summary.species_distribution).length >
              0 && (
              <div style={{ marginBottom: 24 }}>
                <Title level={5} style={{ fontSize: 15, marginBottom: 8 }}>
                  Species Distribution
                </Title>
                {buildPatientDistTable(
                  stats.patient_summary.species_distribution,
                  stats.patient_summary.total_with_patient_info,
                  "Species"
                )}
              </div>
            )}

            {Object.keys(stats.patient_summary.sex_distribution).length >
              0 && (
              <div style={{ marginBottom: 24 }}>
                <Title level={5} style={{ fontSize: 15, marginBottom: 8 }}>
                  Sex Distribution
                </Title>
                {buildPatientDistTable(
                  stats.patient_summary.sex_distribution,
                  stats.patient_summary.total_with_patient_info,
                  "Sex"
                )}
              </div>
            )}
          </>
        )}
    </div>
  );
}

// Reusable comparison section for AI or CV vs Manual
function ComparisonSection({ title, comparison, methodLabel, accentColor, metricsColumns, formatMetric }) {
  return (
    <>
      <Title level={5} style={{ color: "#1a365d", marginBottom: 16 }}>
        {title}
      </Title>
      <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
        <Col xs={8}>
          <Card>
            <Statistic
              title="Compared"
              value={comparison.total_compared}
            />
          </Card>
        </Col>
        <Col xs={8}>
          <Card>
            <Statistic title="Matches" value={comparison.matches} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card>
            <Statistic
              title="Accuracy"
              value={formatMetric(comparison.accuracy)}
              valueStyle={{ color: accentColor }}
            />
          </Card>
        </Col>
      </Row>

      {comparison.per_category.length > 0 && (
        <>
          <Title
            level={5}
            style={{ color: "#1a365d", marginBottom: 16 }}
          >
            Per-Category Metrics ({methodLabel})
          </Title>
          <Table
            columns={metricsColumns}
            dataSource={comparison.per_category.map((row) => ({
              ...row,
              key: row.category,
            }))}
            pagination={false}
            size="small"
            scroll={{ x: 400 }}
            style={{ marginBottom: 32 }}
          />
        </>
      )}

      {comparison.confusion_matrix.length > 0 && (
        <>
          <Title
            level={5}
            style={{ color: "#1a365d", marginBottom: 8 }}
          >
            Confusion Matrix ({methodLabel})
          </Title>
          <Text
            type="secondary"
            style={{ display: "block", marginBottom: 12, fontSize: 13 }}
          >
            Rows = {methodLabel} Predicted, Columns = Manual Actual
          </Text>
          <div style={{ overflowX: "auto", marginBottom: 32 }}>
            <ConfusionMatrix data={comparison.confusion_matrix} />
          </div>
        </>
      )}
    </>
  );
}

// Confusion matrix as HTML table with inline styles for diagonal highlighting
function ConfusionMatrix({ data }) {
  const labels = Array.from(
    new Set(data.flatMap((d) => [d.predicted, d.actual]))
  ).sort();

  const lookup = {};
  data.forEach((d) => {
    lookup[`${d.predicted}||${d.actual}`] = d.count;
  });

  const cellBase = {
    padding: "8px 10px",
    border: "1px solid #e2e8f0",
    textAlign: "center",
    minWidth: 40,
    fontSize: 13,
  };
  const headerCell = {
    ...cellBase,
    background: "#f7fafc",
    fontWeight: 600,
    color: "#2d3748",
    fontSize: 12,
  };

  return (
    <table
      style={{
        borderCollapse: "collapse",
        fontSize: 13,
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
      }}
    >
      <thead>
        <tr>
          <th
            style={{
              ...headerCell,
              textAlign: "left",
              color: "#718096",
            }}
          >
            Predicted \ Actual
          </th>
          {labels.map((label) => (
            <th key={label} style={{ ...headerCell, maxWidth: 100, wordWrap: "break-word" }}>
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {labels.map((predicted) => (
          <tr key={predicted}>
            <td
              style={{
                ...headerCell,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {predicted}
            </td>
            {labels.map((actual) => {
              const count = lookup[`${predicted}||${actual}`] || 0;
              const isDiagonal = predicted === actual;
              return (
                <td
                  key={actual}
                  style={{
                    ...cellBase,
                    background: isDiagonal ? "#ebf4ff" : "transparent",
                    color: count > 0 ? "#2d3748" : "#a0aec0",
                    fontWeight: count > 0 ? 600 : 400,
                  }}
                >
                  {count > 0 ? count : ""}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
