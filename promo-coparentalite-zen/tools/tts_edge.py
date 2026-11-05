"""Run $LIB/core/tts/tts_zh.py with certifi pointed at the environment's CA bundle (proxied networks)."""
import os, sys, runpy, certifi
ca = os.environ.get('SSL_CERT_FILE')
if ca and os.path.exists(ca): certifi.where = lambda: ca
lib = os.environ['LIB']; sys.argv = [lib + '/core/tts/tts_zh.py'] + sys.argv[1:]
runpy.run_path(sys.argv[0], run_name='__main__')
