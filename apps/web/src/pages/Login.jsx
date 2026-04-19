import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Card, Form, Input, Button, Typography, Alert, App } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { useAuth } from "../context/AuthContext";

const { Title, Text } = Typography;

export default function Login() {
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = App.useApp();
  const justRegistered = location.state?.registered;

  const onFinish = async (values) => {
    setSubmitting(true);
    try {
      await login(values.username, values.password);
      navigate("/");
    } catch (err) {
      message.error(err.response?.data?.detail || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f0f4f8",
      }}
    >
      <Card
        style={{ width: "100%", maxWidth: 400 }}
        styles={{ body: { padding: "2.5rem 2rem" } }}
      >
        <Title
          level={3}
          style={{ textAlign: "center", color: "#1a365d", marginBottom: 4 }}
        >
          LFA Reader
        </Title>
        <Text
          type="secondary"
          style={{ display: "block", textAlign: "center", marginBottom: 32 }}
        >
          Veterinary Diagnostic Image Analysis
        </Text>

        {justRegistered && (
          <Alert
            type="success"
            message="Account created successfully. Please sign in."
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <Form layout="vertical" onFinish={onFinish} autoComplete="off">
          <Form.Item
            label="Username"
            name="username"
            rules={[{ required: true, message: "Please enter your username" }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="Username"
              autoFocus
              size="large"
            />
          </Form.Item>

          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: "Please enter your password" }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Password"
              size="large"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={submitting}
            >
              Sign in
            </Button>
          </Form.Item>
        </Form>

        <Text
          type="secondary"
          style={{ display: "block", textAlign: "center", marginTop: 24 }}
        >
          Don't have an account?{" "}
          <Link to="/register" style={{ fontWeight: 600 }}>
            Register
          </Link>
        </Text>
      </Card>
    </div>
  );
}
