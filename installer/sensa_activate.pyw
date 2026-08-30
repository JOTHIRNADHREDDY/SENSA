import tkinter as tk
from tkinter import messagebox
import urllib.request
import json
import os
import sys
import platform
import uuid

API_URL = os.getenv("SENSA_API_URL", "https://api.sensa.io")

def get_device_info():
    return {
        "device_id": str(uuid.getnode()),
        "installation_id": "INSTALL-" + str(uuid.uuid4()).split("-")[0].upper(),
        "platform": f"windows-{platform.machine().lower()}",
        "agent_version": "1.0.0"
    }

def activate_license():
    license_key = key_entry.get().strip()
    if not license_key:
        messagebox.showerror("Error", "Please enter a valid License Key.")
        return

    device_info = get_device_info()
    payload = {
        "license_key": license_key,
        "device_id": device_info["device_id"],
        "installation_id": device_info["installation_id"],
        "agent_version": device_info["agent_version"],
        "platform": device_info["platform"]
    }
    
    try:
        req = urllib.request.Request(f"{API_URL}/api/license/activate", method="POST")
        req.add_header("Content-Type", "application/json")
        data = json.dumps(payload).encode("utf-8")
        
        with urllib.request.urlopen(req, data=data) as response:
            result = json.loads(response.read().decode("utf-8"))
            
            # Save state
            program_data = os.environ.get("PROGRAMDATA", "C:\\ProgramData")
            license_dir = os.path.join(program_data, "SENSA", "license")
            os.makedirs(license_dir, exist_ok=True)
            
            state_file = os.path.join(license_dir, "state.json")
            with open(state_file, "w") as f:
                json.dump(result, f)
                
            messagebox.showinfo("Success", f"SENSA Activated Successfully!\nPlan: {result.get('plan_id', 'Unknown')}\nCameras: {result.get('entitlements', {}).get('max_cameras', 'Unknown')}")
            root.destroy()
            sys.exit(0)
    except urllib.error.HTTPError as e:
        try:
            err_msg = json.loads(e.read().decode("utf-8")).get("detail", "Unknown Error")
        except:
            err_msg = str(e)
        messagebox.showerror("Activation Failed", f"We couldn't activate this license.\nReason: {err_msg}")
    except Exception as e:
        messagebox.showerror("Activation Failed", f"Unable to verify license. Check your Internet connection.\nDetails: {str(e)}")

root = tk.Tk()
root.title("Activate SENSA")
root.geometry("400x250")
root.resizable(False, False)
root.configure(bg="#f4f4f9")

# Header
tk.Label(root, text="Activate SENSA", font=("Segoe UI", 16, "bold"), bg="#f4f4f9", fg="#333").pack(pady=20)
tk.Label(root, text="Enter your license key:", font=("Segoe UI", 10), bg="#f4f4f9", fg="#555").pack()

# Input
key_entry = tk.Entry(root, font=("Courier", 12), width=30, justify="center")
key_entry.pack(pady=10)

# Button
activate_btn = tk.Button(root, text="Activate SENSA →", font=("Segoe UI", 10, "bold"), bg="#0ea5e9", fg="white", activebackground="#0284c7", activeforeground="white", relief="flat", cursor="hand2", command=activate_license)
activate_btn.pack(pady=10, ipadx=10, ipady=5)

# Footer
tk.Label(root, text="Need help? Contact SENSA Support", font=("Segoe UI", 8), bg="#f4f4f9", fg="#888").pack(side="bottom", pady=10)

root.mainloop()
