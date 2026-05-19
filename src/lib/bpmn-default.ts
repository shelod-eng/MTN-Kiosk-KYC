export const defaultBpmnXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1"
  targetNamespace="http://kiosk-kyc/workflow">
  <bpmn:process id="KycProcess" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Start KYC">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Task_PersonalDetails" name="Personal Details">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:serviceTask id="Task_OCR" name="OCR Extraction">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:serviceTask id="Task_Selfie" name="Selfie Verification">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:serviceTask id="Task_POA" name="Proof Of Address Validation">
      <bpmn:incoming>Flow_4</bpmn:incoming>
      <bpmn:outgoing>Flow_5</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:serviceTask id="Task_DHA" name="DHA Validation">
      <bpmn:incoming>Flow_5</bpmn:incoming>
      <bpmn:outgoing>Flow_6</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:serviceTask id="Task_TransUnion" name="TransUnion Check">
      <bpmn:incoming>Flow_6</bpmn:incoming>
      <bpmn:outgoing>Flow_7</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:serviceTask id="Task_Experian" name="Experian Check">
      <bpmn:incoming>Flow_7</bpmn:incoming>
      <bpmn:outgoing>Flow_8</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:serviceTask id="Task_RiskDecision" name="Risk Decision">
      <bpmn:incoming>Flow_8</bpmn:incoming>
      <bpmn:outgoing>Flow_9</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:exclusiveGateway id="Gateway_Decision" name="Decision Gateway">
      <bpmn:incoming>Flow_9</bpmn:incoming>
      <bpmn:outgoing>Flow_Approve</bpmn:outgoing>
      <bpmn:outgoing>Flow_Review</bpmn:outgoing>
      <bpmn:outgoing>Flow_Reject</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:endEvent id="End_Approve" name="Approve">
      <bpmn:incoming>Flow_Approve</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:endEvent id="End_Review" name="Review">
      <bpmn:incoming>Flow_Review</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:endEvent id="End_Reject" name="Reject">
      <bpmn:incoming>Flow_Reject</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_PersonalDetails" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_PersonalDetails" targetRef="Task_OCR" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_OCR" targetRef="Task_Selfie" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Task_Selfie" targetRef="Task_POA" />
    <bpmn:sequenceFlow id="Flow_5" sourceRef="Task_POA" targetRef="Task_DHA" />
    <bpmn:sequenceFlow id="Flow_6" sourceRef="Task_DHA" targetRef="Task_TransUnion" />
    <bpmn:sequenceFlow id="Flow_7" sourceRef="Task_TransUnion" targetRef="Task_Experian" />
    <bpmn:sequenceFlow id="Flow_8" sourceRef="Task_Experian" targetRef="Task_RiskDecision" />
    <bpmn:sequenceFlow id="Flow_9" sourceRef="Task_RiskDecision" targetRef="Gateway_Decision" />
    <bpmn:sequenceFlow id="Flow_Approve" sourceRef="Gateway_Decision" targetRef="End_Approve">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${decision === 'APPROVE'}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_Review" sourceRef="Gateway_Decision" targetRef="End_Review">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${decision === 'REVIEW'}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_Reject" sourceRef="Gateway_Decision" targetRef="End_Reject">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${decision === 'REJECT'}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BpmnDiagram_1">
    <bpmndi:BPMNPlane id="BpmnPlane_1" bpmnElement="KycProcess">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="160" y="180" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_PersonalDetails_di" bpmnElement="Task_PersonalDetails">
        <dc:Bounds x="240" y="158" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_OCR_di" bpmnElement="Task_OCR">
        <dc:Bounds x="410" y="158" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Selfie_di" bpmnElement="Task_Selfie">
        <dc:Bounds x="580" y="158" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_POA_di" bpmnElement="Task_POA">
        <dc:Bounds x="750" y="158" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_DHA_di" bpmnElement="Task_DHA">
        <dc:Bounds x="940" y="158" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_TransUnion_di" bpmnElement="Task_TransUnion">
        <dc:Bounds x="1110" y="158" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Experian_di" bpmnElement="Task_Experian">
        <dc:Bounds x="1300" y="158" width="130" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_RiskDecision_di" bpmnElement="Task_RiskDecision">
        <dc:Bounds x="1480" y="158" width="130" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_Decision_di" bpmnElement="Gateway_Decision" isMarkerVisible="true">
        <dc:Bounds x="1660" y="173" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_Approve_di" bpmnElement="End_Approve">
        <dc:Bounds x="1780" y="80" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_Review_di" bpmnElement="End_Review">
        <dc:Bounds x="1780" y="180" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_Reject_di" bpmnElement="End_Reject">
        <dc:Bounds x="1780" y="280" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="196" y="198" />
        <di:waypoint x="240" y="198" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="360" y="198" />
        <di:waypoint x="410" y="198" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="530" y="198" />
        <di:waypoint x="580" y="198" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_4_di" bpmnElement="Flow_4">
        <di:waypoint x="700" y="198" />
        <di:waypoint x="750" y="198" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_5_di" bpmnElement="Flow_5">
        <di:waypoint x="890" y="198" />
        <di:waypoint x="940" y="198" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_6_di" bpmnElement="Flow_6">
        <di:waypoint x="1060" y="198" />
        <di:waypoint x="1110" y="198" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_7_di" bpmnElement="Flow_7">
        <di:waypoint x="1250" y="198" />
        <di:waypoint x="1300" y="198" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_8_di" bpmnElement="Flow_8">
        <di:waypoint x="1430" y="198" />
        <di:waypoint x="1480" y="198" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_9_di" bpmnElement="Flow_9">
        <di:waypoint x="1610" y="198" />
        <di:waypoint x="1660" y="198" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Approve_di" bpmnElement="Flow_Approve">
        <di:waypoint x="1710" y="198" />
        <di:waypoint x="1745" y="198" />
        <di:waypoint x="1745" y="98" />
        <di:waypoint x="1780" y="98" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Review_di" bpmnElement="Flow_Review">
        <di:waypoint x="1710" y="198" />
        <di:waypoint x="1780" y="198" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Reject_di" bpmnElement="Flow_Reject">
        <di:waypoint x="1710" y="198" />
        <di:waypoint x="1745" y="198" />
        <di:waypoint x="1745" y="298" />
        <di:waypoint x="1780" y="298" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
