from pathlib import Path
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import health_store
import server


class RuntimeConfiguration(unittest.TestCase):
    def test_container_bind_address_does_not_expand_authorized_hosts(self):
        http = server.make_server(0, host="0.0.0.0")
        try:
            self.assertEqual(http.server_address[0], "0.0.0.0")
            self.assertIn(f"localhost:{http.server_port}", http.allowed_hosts)
            self.assertNotIn(f"0.0.0.0:{http.server_port}", http.allowed_hosts)
            self.assertNotIn("unrelated.example", http.allowed_hosts)
        finally:
            http.server_close()

    def test_default_bind_address_remains_loopback(self):
        http = server.make_server(0)
        try:
            self.assertEqual(http.server_address[0], "127.0.0.1")
        finally:
            http.server_close()

    def test_root_env_database_setting_is_used_after_store_construction(self):
        store = health_store.HealthStore()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "app").mkdir()
            dsn = "host=example.invalid dbname=late_configuration"
            (root / ".env.local").write_text(f"LUKLAAN_DATABASE_URL={dsn}\n")
            with patch.dict(os.environ, {}, clear=True), patch.object(server, "ROOT", root / "app"), patch.object(health_store, "ConnectionPool") as pool, patch.object(health_store, "seed_knowledge"):
                server.load_local_env()
                store.initialize()
                self.assertEqual(pool.call_args.args[0], dsn)
                self.assertIs(store.pool, pool.return_value)


if __name__ == "__main__":
    unittest.main()
