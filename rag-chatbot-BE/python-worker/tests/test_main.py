from unittest.mock import Mock

from pika.adapters.utils.connection_workflow import AMQPConnectorStackTimeout

from main import Worker


def test_start_retries_after_amqp_handshake_timeout(monkeypatch):
    worker = Worker.__new__(Worker)
    worker._running = False
    worker._connect = Mock(side_effect=AMQPConnectorStackTimeout())
    worker._close_connection = Mock()

    def stop_after_first_retry(_: float) -> None:
        worker._running = False

    monkeypatch.setattr("main.time.sleep", stop_after_first_retry)

    worker.start()

    worker._connect.assert_called_once_with()
    worker._close_connection.assert_called_once_with()
