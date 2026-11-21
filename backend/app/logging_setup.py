import logging


def configure_logging(level: str):
    """Enable application logs without changing Uvicorn or third-party loggers."""
    logger = logging.getLogger("app")
    if not any(getattr(handler, "adrobot", False) for handler in logger.handlers):
        handler = logging.StreamHandler()
        handler.adrobot = True
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
        )
        logger.addHandler(handler)
    logger.setLevel(level)
    logger.propagate = False
