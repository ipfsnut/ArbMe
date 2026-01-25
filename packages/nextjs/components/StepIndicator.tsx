'use client'

interface Step {
  number: number
  label: string
}

interface StepIndicatorProps {
  steps: Step[]
  currentStep: number
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <div className="step-indicator">
      {steps.map((step, index) => (
        <div key={step.number} className="step-item-wrapper">
          <div
            className={`step-item ${
              currentStep === step.number
                ? 'active'
                : currentStep > step.number
                ? 'completed'
                : ''
            }`}
          >
            <div className="step-circle">
              {currentStep > step.number ? (
                <span className="step-check">✓</span>
              ) : (
                <span className="step-number">{step.number}</span>
              )}
            </div>
            <span className="step-label">{step.label}</span>
          </div>
          {index < steps.length - 1 && (
            <div
              className={`step-connector ${
                currentStep > step.number ? 'completed' : ''
              }`}
            />
          )}
        </div>
      ))}
    </div>
  )
}
