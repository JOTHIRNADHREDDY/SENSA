import win32serviceutil
import win32service
import win32event
import servicemanager
import socket
import os
import sys
import asyncio
from pathlib import Path

# Add current directory to path so main can be imported
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import main

class SENSAAgentService(win32serviceutil.ServiceFramework):
    _svc_name_ = "SENSAAgent"
    _svc_display_name_ = "SENSA Security Agent"
    _svc_description_ = "SENSA AI Security system agent and camera manager."
    
    # TODO(Serverless Migration): Ensure service gracefully handles new Cloudflare/Firebase API errors
    
    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)
        socket.setdefaulttimeout(60)

    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        win32event.SetEvent(self.hWaitStop)

    def SvcDoRun(self):
        servicemanager.LogMsg(
            servicemanager.EVENTLOG_INFORMATION_TYPE,
            servicemanager.PYS_SERVICE_STARTED,
            (self._svc_name_, '')
        )
        self.main()

    def main(self):
        # We need to run the asyncio loop from main.py
        # Create a task that can be cancelled when service stops
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        main_task = loop.create_task(main.main())
        
        # Run until stopped
        def check_stop():
            if win32event.WaitForSingleObject(self.hWaitStop, 1000) == win32event.WAIT_OBJECT_0:
                main_task.cancel()
            else:
                loop.call_later(1.0, check_stop)
                
        loop.call_later(1.0, check_stop)
        
        try:
            loop.run_until_complete(main_task)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            servicemanager.LogErrorMsg(f"SENSAAgent crashed: {e}")

if __name__ == '__main__':
    if len(sys.argv) == 1:
        servicemanager.Initialize()
        servicemanager.PrepareToHostSingle(SENSAAgentService)
        servicemanager.StartServiceCtrlDispatcher()
    else:
        win32serviceutil.HandleCommandLine(SENSAAgentService)
