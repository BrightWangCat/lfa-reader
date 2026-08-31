import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Table,
  Tag,
  Button,
  Select,
  Space,
  Popconfirm,
  Typography,
  Alert,
  Empty,
  App,
} from "antd";
import {
  EyeOutlined,
  DeleteOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import diseases from "@shared/data/diseases.json";
import { listImages, deleteImage } from "../services/api";
import { formatEasternDateTime } from "../utils/dateFormat";
import { isPositiveFinal } from "../utils/resultDisplay";
import { useAuth } from "../context/authStore";
import { isClinicalRole } from "./userRoles";
import { startTestPathFor } from "../utils/shellPaths";

const { Title } = Typography;

const RESULT_FILTERS = [
  { value: "all", label: "All results" },
  { value: "positive", label: "Positive" },
  { value: "negative", label: "Negative" },
  { value: "pending", label: "Pending" },
];

const matchesResultFilter = (record, filter) => {
  const final = record.manual_correction || record.cv_result;
  if (filter === "positive") return isPositiveFinal(final);
  if (filter === "negative") return final === "Negative";
  if (filter === "pending") return !final;
  return true;
};

const statusConfig = {
  completed: { color: "green", label: "Done" },
  running: { color: "gold", label: "Running" },
  failed: { color: "red", label: "Failed" },
};

export default function History() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [diseaseFilter, setDiseaseFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { user } = useAuth();
  const ownerView = !isClinicalRole(user?.role);
  const startPath = startTestPathFor(user);

  useEffect(() => {
    fetchImages();
  }, []);

  const fetchImages = async () => {
    try {
      const res = await listImages();
      setImages(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load history");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (imageId) => {
    setDeletingId(imageId);
    try {
      await deleteImage(imageId);
      setImages((prev) => prev.filter((img) => img.id !== imageId));
    } catch (err) {
      message.error(err.response?.data?.detail || "Failed to delete image");
    } finally {
      setDeletingId(null);
    }
  };

  const renderResultTag = (record) => {
    const final = record.manual_correction || record.cv_result;
    if (final) {
      const color = isPositiveFinal(final)
        ? "red"
        : final === "Negative"
          ? "green"
          : "default";
      return (
        <Tag color={color} style={{ whiteSpace: "normal", margin: 0 }}>
          {final}
          {record.manual_correction ? " (reviewed)" : ""}
        </Tag>
      );
    }
    return <Typography.Text type="secondary">--</Typography.Text>;
  };

  const filteredImages = useMemo(
    () =>
      images.filter(
        (record) =>
          (diseaseFilter === "all" ||
            record.disease_category === diseaseFilter) &&
          matchesResultFilter(record, resultFilter)
      ),
    [images, diseaseFilter, resultFilter]
  );

  const columns = [
    {
      title: "ID",
      dataIndex: "id",
      key: "id",
      width: 60,
      align: "center",
      responsive: ["md"],
    },
    {
      title: "Filename",
      dataIndex: "original_filename",
      key: "filename",
      ellipsis: true,
    },
    {
      title: "Disease",
      dataIndex: "disease_category",
      key: "disease",
      width: 170,
      responsive: ["md"],
      render: (d) =>
        d ? (
          <Tag color="geekblue">{d}</Tag>
        ) : (
          <Typography.Text type="secondary">--</Typography.Text>
        ),
    },
    {
      title: "Result",
      key: "result",
      width: 220,
      align: "center",
      render: (_, record) => renderResultTag(record),
    },
    {
      title: "Status",
      dataIndex: "reading_status",
      key: "status",
      width: 90,
      align: "center",
      render: (status) => {
        const config = statusConfig[status];
        return config ? (
          <Tag color={config.color}>{config.label}</Tag>
        ) : (
          <Typography.Text type="secondary">--</Typography.Text>
        );
      },
    },
    {
      title: "Uploaded Time",
      dataIndex: "created_at",
      key: "date",
      width: 230,
      responsive: ["lg"],
      render: (date) => formatEasternDateTime(date),
    },
    ...(ownerView
      ? []
      : [
          {
            title: "Uploaded By",
            dataIndex: "username",
            key: "user",
            width: 120,
            responsive: ["md"],
            render: (u) => u || "Unknown",
          },
        ]),
    {
      title: "Actions",
      key: "actions",
      width: 160,
      render: (_, record) => (
        <Space size="small" wrap>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/results?image=${record.id}`)}
          >
            View
          </Button>
          <Popconfirm
            title="Delete this image?"
            description="This cannot be undone."
            onConfirm={() => handleDelete(record.id)}
            okText="Delete"
            okType="danger"
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={deletingId === record.id}
            >
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
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
          marginBottom: 16,
        }}
      >
        <Title level={3} style={{ color: "var(--ink-strong)", margin: 0 }}>
          {ownerView ? "My Results" : "Submissions"}
        </Title>
        <Link to={startPath}>
          <Button type="primary" icon={<PlusOutlined />}>
            New Test
          </Button>
        </Link>
      </div>

      {!ownerView && (
        <Space wrap style={{ marginBottom: 16 }}>
          <Select
            value={diseaseFilter}
            onChange={setDiseaseFilter}
            style={{ width: 180 }}
            options={[
              { value: "all", label: "All workflows" },
              ...diseases.map((d) => ({ value: d.label, label: d.label })),
            ]}
          />
          <Select
            value={resultFilter}
            onChange={setResultFilter}
            style={{ width: 140 }}
            options={RESULT_FILTERS}
          />
        </Space>
      )}

      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Table
        columns={columns}
        dataSource={filteredImages}
        rowKey="id"
        loading={loading}
        scroll={{ x: 500 }}
        locale={{
          emptyText: (
            <Empty description="No test results yet.">
              <Link to={startPath}>
                <Button type="primary">Start your first test</Button>
              </Link>
            </Empty>
          ),
        }}
        pagination={{ pageSize: 20 }}
      />
    </div>
  );
}
