import re

with open('src/components/billing/BillingPage.tsx', 'r') as f:
    content = f.read()

insert_marker = "  if (loading) {"

new_content = """  const handlePlanChangeSelect = (newPlanId: string, maxCameras: number) => {
    // In a real app, this would check current camera count
    // and prevent downgrade if current count > maxCameras
    if (sub && sub.plan_id === 'business' && (newPlanId === 'professional' || newPlanId === 'base_license')) {
      alert(`Warning: Your current deployment might exceed the ${maxCameras} camera limit of the new plan. Please reduce camera usage before downgrading.`);
      return;
    }
    
    if (sub && sub.plan_id === 'professional' && newPlanId === 'base_license') {
      alert(`Warning: Your current deployment might exceed the ${maxCameras} camera limit of the new plan. Please reduce camera usage before downgrading.`);
      return;
    }

    const confirmMsg = `Are you sure you want to change your plan to ${newPlanId.replace('_', ' ').toUpperCase()}?`;
    if (window.confirm(confirmMsg)) {
      alert(`Plan successfully changed to ${newPlanId.replace('_', ' ').toUpperCase()}. Charges have been prorated.`);
      setIsChangePlanModalOpen(false);
    }
  };

"""

if insert_marker in content:
    new_full_content = content.replace(insert_marker, new_content + insert_marker)
    with open('src/components/billing/BillingPage.tsx', 'w') as f:
        f.write(new_full_content)
    print("Successfully added handlePlanChangeSelect.")
else:
    print("Could not find insert marker.")
