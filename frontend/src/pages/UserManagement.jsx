import { useState, useEffect } from "react";
import {
  Table,
  Tag,
  Button,
  Select,
  Space,
  Typography,
  Popconfirm,
  App,
  Spin,
  Alert,
} from "antd";
import {
  CrownOutlined,
  DeleteOutlined,
  UserOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

const { Title } = Typography;

// Role display configuration
const roleConfig = {
  admin: { color: "gold", icon: <CrownOutlined />, label: "Admin" },
  batch: { color: "blue", icon: <TeamOutlined />, label: "Batch" },
  single: { color: "default", icon: <UserOutlined />, label: "Single" },
};

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const { message } = App.useApp();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState({});

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await api.get("/api/users/");
      setUsers(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const handleSetRole = async (userId, newRole) => {
    setActionLoading((prev) => ({ ...prev, [userId]: true }));
    try {
      const res = await api.put(`/api/users/${userId}/role`, { role: newRole });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? res.data : u))
      );
      message.success(`Role updated to ${newRole}`);
    } catch (err) {
      message.error(err.response?.data?.detail || "Failed to update role");
    } finally {
      setActionLoading((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const handleDelete = async (userId) => {
    setActionLoading((prev) => ({ ...prev, [`del_${userId}`]: true }));
    try {
      await api.delete(`/api/users/${userId}`);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      message.success("User deleted");
    } catch (err) {
      message.error(err.response?.data?.detail || "Failed to delete user");
    } finally {
      setActionLoading((prev) => ({ ...prev, [`del_${userId}`]: false }));
    }
  };

  const columns = [
    {
      title: "ID",
      dataIndex: "id",
      key: "id",
      width: 60,
    },
    {
      title: "Username",
      dataIndex: "username",
      key: "username",
    },
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
    },
    {
      title: "Role",
      key: "role",
      width: 120,
      render: (_, record) => {
        const config = roleConfig[record.role] || roleConfig.single;
        return (
          <Tag icon={config.icon} color={config.color}>
            {config.label}
          </Tag>
        );
      },
    },
    {
      title: "Registered",
      dataIndex: "created_at",
      key: "created_at",
      render: (val) => new Date(val).toLocaleDateString(),
    },
    {
      title: "Actions",
      key: "actions",
      width: 260,
      render: (_, record) => {
        const isSelf = record.id === currentUser?.id;
        return (
          <Space>
            <Select
              value={record.role}
              onChange={(value) => handleSetRole(record.id, value)}
              disabled={isSelf}
              loading={actionLoading[record.id]}
              style={{ width: 110 }}
              size="small"
              options={[
                { value: "single", label: "Single" },
                { value: "batch", label: "Batch" },
                { value: "admin", label: "Admin" },
              ]}
            />
            <Popconfirm
              title="Delete this user?"
              description="All batches and images owned by this user will be permanently deleted."
              onConfirm={() => handleDelete(record.id)}
              okText="Delete"
              okType="danger"
              disabled={isSelf}
            >
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                loading={actionLoading[`del_${record.id}`]}
                disabled={isSelf}
              >
                Delete
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

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
        <Alert type="error" message={error} showIcon style={{ maxWidth: 400, margin: "0 auto" }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <Title level={3} style={{ color: "#1a365d", marginBottom: 24 }}>
        User Management
      </Title>
      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        pagination={false}
        bordered
        size="middle"
      />
    </div>
  );
}
