import { Players, RunService, Workspace } from "@rbxts/services";

/*
	------------------------
	Libraries | Dependencies
	------------------------
	All the libraries and dependencies that are used throughout the code.
	
*/
/**
 * Tracks connections, instances, functions, threads, and objects to be later destroyed.
 */
class Bin {
	private head: Node | undefined;
	private tail: Node | undefined;

	/**
	 * Adds an item into the Bin. This can be a:
	 * - `() => unknown`
	 * - RBXScriptConnection
	 * - thread
	 * - Object with `.destroy()` or `.Destroy()`
	 */
	public add<I extends Bin.Item>(item: I) {
		const node: Node = { item };
		this.head ??= node;
		if (this.tail) this.tail.next = node;
		this.tail = node;
		return this;
	}

	/**
	 * Destroys all items currently in the Bin:
	 * - Functions will be called
	 * - RBXScriptConnections will be disconnected
	 * - threads will be `task.cancel()`-ed
	 * - Objects will be `.destroy()`-ed
	 */
	public destroy(): void {
		let head = this.head;
		while (head) {
			const { item } = head;
			if (typeIs(item, "function")) {
				item();
			} else if (typeIs(item, "RBXScriptConnection")) {
				item.Disconnect();
			} else if (typeIs(item, "thread")) {
				task.cancel(item);
			} else if ("destroy" in item) {
				item.destroy();
			} else if ("Destroy" in item) {
				item.Destroy();
			}
			head = head.next;
			this.head = head;
		}
	}

	/**
	 * Checks whether the Bin is empty.
	 */
	public isEmpty(): boolean {
		return this.head === undefined;
	}
}
namespace Bin {
	export type Item = (() => unknown) | RBXScriptConnection | thread | { destroy(): void } | { Destroy(): void };
}
type Node = { next?: Node; item: Bin.Item };

/*
	----------------------
	Variables & References
	----------------------
	Holds all the variables and references that are used throughout the code.

*/
const LocalPlayer = Players.LocalPlayer;

let CurrentCamera = Workspace.CurrentCamera!;

const ScreenGui = new Instance("ScreenGui");

/*
	--------------------
	Function Declaration
	--------------------
	All the functions that are used throughout the code.

*/
function updateLineFromPoints(line: Frame, from: Vector2, to: Vector2) {
	const displacement = to.sub(from);
	const distance = displacement.Magnitude;
	const midpoint = from.add(displacement.div(2));
	const angle = math.deg(math.atan2(displacement.Y, displacement.X));

	line.Position = new UDim2(0, midpoint.X, 0, midpoint.Y);
	line.Size = new UDim2(0, distance, 0, line.Size.Y.Offset);
	line.Rotation = angle;
}

/*
	---------------------
	Component Declaration
	---------------------
	All the components that are used throughout the code.

*/
type Points = {
	C: Attachment;
	T: Attachment;
	B: Attachment;
	BL: Attachment;
	BR: Attachment;
	TL: Attachment;
	TR: Attachment;
};
type Bones = {
	face: Attachment;
	neck: Attachment;
	waist: Attachment;
	right_shoulder: Attachment;
	right_hand: Attachment;
	right_hip: Attachment;
	right_foot: Attachment;
	left_shoulder: Attachment;
	left_hand: Attachment;
	left_hip: Attachment;
	left_foot: Attachment;
};

class ESP {
	public static instances = new Map<Model, ESP>();

	private readonly bin = new Bin();
	private readonly instance: Model;
	private readonly humanoid: Humanoid;
	private readonly points: Points;
	private readonly bones: Bones;
	private readonly box_lines: Array<Frame>;
	private readonly bone_lines: Array<Frame>;
	private readonly labels = {
		container: new Instance("Frame"),
		name: new Instance("TextLabel"),
		data: new Instance("TextLabel"),
		listlayout: new Instance("UIListLayout"),
	};

	constructor(entity: Model) {
		// Set up:
		this.instance = entity;

		const humanoid = entity.WaitForChild("Humanoid") as Humanoid;
		this.humanoid = humanoid;

		// Attachments:
		this.points = this.constructPoints();
		this.bones = this.constructBones();

		// Lines:
		const [box_lines, bone_lines] = this.constructLines();
		this.box_lines = box_lines;
		this.bone_lines = bone_lines;

		// User Interface:
		this.setLabels();

		// Initialize:
		const bin = this.bin;
		const instances = ESP.instances;
		instances.set(entity, this);
		bin.add(() => instances.delete(entity));
		entity.AncestryChanged.Connect((_, parent) => parent === undefined && this.destroy());

		// Manual Update:
		this.update();
	}

	private constructPoints() {
		const C = new Instance("Attachment");
		const T = new Instance("Attachment");
		const B = new Instance("Attachment");
		const BL = new Instance("Attachment");
		const BR = new Instance("Attachment");
		const TL = new Instance("Attachment");
		const TR = new Instance("Attachment");

		const entity = this.instance;
		const head = entity.WaitForChild("Head") as Part;
		const root = (entity.WaitForChild("HumanoidRootPart", 5) ?? entity.WaitForChild("Torso")) as Part;
		const right_arm = entity.WaitForChild("Right Arm") as Part;
		const right_leg = entity.WaitForChild("Right Leg") as Part;

		const U = root.Size.Y / 2 + head.Size.Y + 0.4;
		const D = -root.Size.Y / 2 - right_leg.Size.Y - 0.3;
		const LR = root.Size.X / 2 + right_arm.Size.X + 0.2;

		T.Position = new Vector3(0, U, 0);
		B.Position = new Vector3(0, D, 0);

		TL.Position = new Vector3(-LR, 0, 0);
		BL.Position = new Vector3(-LR, 0, 0);
		TR.Position = new Vector3(LR, 0, 0);
		BR.Position = new Vector3(LR, 0, 0);

		T.Parent = C;
		B.Parent = C;
		BL.Parent = B;
		BR.Parent = B;
		TL.Parent = T;
		TR.Parent = T;
		C.Parent = root;

		return { C, T, B, BL, BR, TL, TR } as Points;
	}

	private constructBones() {
		// References:
		const entity = this.instance;
		const head = entity.WaitForChild("Head") as Part;
		const torso = entity.WaitForChild("Torso") as Part;
		const right_arm = entity.WaitForChild("Right Arm") as Part;
		const right_leg = entity.WaitForChild("Right Leg") as Part;
		const left_arm = entity.WaitForChild("Left Arm") as Part;
		const left_leg = entity.WaitForChild("Left Leg") as Part;

		// Variables:
		const head_size = head.Size;
		const torso_size = torso.Size;
		const right_arm_size = right_arm.Size;
		const right_leg_size = right_leg.Size;

		const [head_y] = [head_size.Y / 2];
		const [torso_y] = [torso_size.Y / 2];
		const [arm_y] = [right_arm_size.Y / 2];
		const [leg_y] = [right_leg_size.Y / 2];

		// Create Bones:
		const face = new Instance("Attachment");
		const neck = new Instance("Attachment");
		const waist = new Instance("Attachment");
		const right_shoulder = new Instance("Attachment");
		const right_hand = new Instance("Attachment");
		const right_hip = new Instance("Attachment");
		const right_foot = new Instance("Attachment");
		const left_shoulder = new Instance("Attachment");
		const left_hand = new Instance("Attachment");
		const left_hip = new Instance("Attachment");
		const left_foot = new Instance("Attachment");

		face.Position = new Vector3(0, head_y, 0);
		neck.Position = new Vector3(0, torso_y, 0);
		waist.Position = new Vector3(0, -torso_y, 0);
		right_shoulder.Position = new Vector3(0, arm_y, 0);
		right_hand.Position = new Vector3(0, -arm_y, 0);
		right_hip.Position = new Vector3(0, leg_y, 0);
		right_foot.Position = new Vector3(0, -leg_y, 0);
		left_shoulder.Position = new Vector3(0, arm_y, 0);
		left_hand.Position = new Vector3(0, -arm_y, 0);
		left_hip.Position = new Vector3(0, leg_y, 0);
		left_foot.Position = new Vector3(0, -leg_y, 0);

		face.Parent = head;
		neck.Parent = torso;
		waist.Parent = torso;
		right_shoulder.Parent = right_arm;
		right_hand.Parent = right_arm;
		right_hip.Parent = right_leg;
		right_foot.Parent = right_leg;
		left_shoulder.Parent = left_arm;
		left_hand.Parent = left_arm;
		left_hip.Parent = left_leg;
		left_foot.Parent = left_leg;

		return {
			face,
			neck,
			waist,
			right_shoulder,
			right_hand,
			right_hip,
			right_foot,
			left_shoulder,
			left_hand,
			left_hip,
			left_foot,
		} as Bones;
	}

	private constructLines() {
		const bin = this.bin;

		const box_lines = new Array<Frame>();
		for (const _ of $range(1, 4)) {
			const line = new Instance("Frame");
			line.Visible = false;
			line.AnchorPoint = new Vector2(0.5, 0.5);
			line.BorderSizePixel = 0;
			line.Parent = ScreenGui;
			box_lines.push(line);
			bin.add(line);
		}

		const bone_lines = new Array<Frame>();
		for (const _ of $range(1, 10)) {
			const line = new Instance("Frame");
			line.Visible = false;
			line.AnchorPoint = new Vector2(0.5, 0.5);
			line.BorderSizePixel = 0;
			line.Parent = ScreenGui;
			bone_lines.push(line);
			bin.add(line);
		}

		return $tuple(box_lines, bone_lines);
	}

	private setLabels() {
		const { labels, instance, humanoid, bin } = this;
		const { container, name, data, listlayout } = labels;

		container.Visible = false;
		container.AnchorPoint = new Vector2(0.5, 0);
		container.BackgroundTransparency = 1;

		name.BackgroundTransparency = 1;
		name.Font = Enum.Font.Nunito;
		name.Size = new UDim2(1, 0, 0, 14);
		name.Text = `${instance.Name} @${humanoid.DisplayName}`;
		name.TextSize = 14;
		name.TextStrokeTransparency = 0.5;

		data.BackgroundTransparency = 1;
		data.Font = Enum.Font.Nunito;
		data.Size = new UDim2(1, 0, 0, 14);
		data.Text = "[85] [100/100] [100%]";
		data.TextSize = 12;
		data.TextStrokeTransparency = 0.5;

		listlayout.HorizontalAlignment = Enum.HorizontalAlignment.Center;
		listlayout.SortOrder = Enum.SortOrder.LayoutOrder;

		name.Parent = container;
		data.Parent = container;
		listlayout.Parent = container;
		container.Parent = ScreenGui;

		bin.add(container);
	}

	private setVisible(visible: boolean) {
		const { box_lines, bone_lines, labels } = this;
		const { container } = labels;
		container.Visible = visible;
		box_lines.forEach((line) => (line.Visible = visible));
		bone_lines.forEach((line) => (line.Visible = visible));
	}

	public update() {
		const { box_lines, bone_lines } = this;
		box_lines.forEach((line) => {
			line.BackgroundColor3 = new Color3(0, 1, 0);
			line.Size = new UDim2(0, 1, 0, 2);
		});
		bone_lines.forEach((line) => {
			line.BackgroundColor3 = new Color3(1, 1, 1);
			line.Size = new UDim2(0, 1, 0, 1);
		});

		const { labels } = this;
		const { container, name, data, listlayout } = labels;
		name.TextColor3 = new Color3(0, 1, 0);
		data.TextColor3 = new Color3(1, 1, 1);
		listlayout.Padding = new UDim(0, -4);
		container.Size = new UDim2(0, 300, 0, listlayout.AbsoluteContentSize.Y);
	}

	public render() {
		const { humanoid, points, bones, box_lines, bone_lines, labels } = this;
		const { container, name, data, listlayout } = labels;

		const { C, T, BL, BR, TL, TR } = points;
		const {
			face,
			neck,
			waist,
			right_shoulder,
			right_hand,
			right_hip,
			right_foot,
			left_shoulder,
			left_hand,
			left_hip,
			left_foot,
		} = bones;

		// World to Viewport:
		const [C_P] = CurrentCamera.WorldToViewportPoint(C.WorldPosition);
		if (C_P.Z < 0) return this.setVisible(false);
		const [T_P] = CurrentCamera.WorldToViewportPoint(T.WorldPosition);
		if (T_P.Z < 0) return this.setVisible(false);
		const [BL_P] = CurrentCamera.WorldToViewportPoint(BL.WorldPosition);
		if (BL_P.Z < 0) return this.setVisible(false);
		const [BR_P] = CurrentCamera.WorldToViewportPoint(BR.WorldPosition);
		if (BR_P.Z < 0) return this.setVisible(false);
		const [TL_P] = CurrentCamera.WorldToViewportPoint(TL.WorldPosition);
		if (TL_P.Z < 0) return this.setVisible(false);
		const [TR_P] = CurrentCamera.WorldToViewportPoint(TR.WorldPosition);
		if (TR_P.Z < 0) return this.setVisible(false);

		const [face_P] = CurrentCamera.WorldToViewportPoint(face.WorldPosition);
		if (face_P.Z < 0) return this.setVisible(false);
		const [neck_P] = CurrentCamera.WorldToViewportPoint(neck.WorldPosition);
		if (neck_P.Z < 0) return this.setVisible(false);
		const [waist_P] = CurrentCamera.WorldToViewportPoint(waist.WorldPosition);
		if (waist_P.Z < 0) return this.setVisible(false);
		const [right_shoulder_P] = CurrentCamera.WorldToViewportPoint(right_shoulder.WorldPosition);
		if (right_shoulder_P.Z < 0) return this.setVisible(false);
		const [right_hand_P] = CurrentCamera.WorldToViewportPoint(right_hand.WorldPosition);
		if (right_hand_P.Z < 0) return this.setVisible(false);
		const [right_hip_P] = CurrentCamera.WorldToViewportPoint(right_hip.WorldPosition);
		if (right_hip_P.Z < 0) return this.setVisible(false);
		const [right_foot_P] = CurrentCamera.WorldToViewportPoint(right_foot.WorldPosition);
		if (right_foot_P.Z < 0) return this.setVisible(false);
		const [left_shoulder_P] = CurrentCamera.WorldToViewportPoint(left_shoulder.WorldPosition);
		if (left_shoulder_P.Z < 0) return this.setVisible(false);
		const [left_hand_P] = CurrentCamera.WorldToViewportPoint(left_hand.WorldPosition);
		if (left_hand_P.Z < 0) return this.setVisible(false);
		const [left_hip_P] = CurrentCamera.WorldToViewportPoint(left_hip.WorldPosition);
		if (left_hip_P.Z < 0) return this.setVisible(false);
		const [left_foot_P] = CurrentCamera.WorldToViewportPoint(left_foot.WorldPosition);
		if (left_foot_P.Z < 0) return this.setVisible(false);

		// Update Box Lines:
		updateLineFromPoints(box_lines[0], new Vector2(TL_P.X, TL_P.Y), new Vector2(TR_P.X, TR_P.Y));
		updateLineFromPoints(box_lines[1], new Vector2(TR_P.X, TR_P.Y), new Vector2(BR_P.X, BR_P.Y));
		updateLineFromPoints(box_lines[2], new Vector2(BR_P.X, BR_P.Y), new Vector2(BL_P.X, BL_P.Y));
		updateLineFromPoints(box_lines[3], new Vector2(BL_P.X, BL_P.Y), new Vector2(TL_P.X, TL_P.Y));

		// Update Bone Lines:
		updateLineFromPoints(bone_lines[0], new Vector2(face_P.X, face_P.Y), new Vector2(neck_P.X, neck_P.Y));
		updateLineFromPoints(bone_lines[1], new Vector2(neck_P.X, neck_P.Y), new Vector2(waist_P.X, waist_P.Y));
		updateLineFromPoints(
			bone_lines[2],
			new Vector2(neck_P.X, neck_P.Y),
			new Vector2(right_shoulder_P.X, right_shoulder_P.Y),
		);
		updateLineFromPoints(
			bone_lines[3],
			new Vector2(right_shoulder_P.X, right_shoulder_P.Y),
			new Vector2(right_hand_P.X, right_hand_P.Y),
		);
		updateLineFromPoints(
			bone_lines[4],
			new Vector2(waist_P.X, waist_P.Y),
			new Vector2(right_hip_P.X, right_hip_P.Y),
		);
		updateLineFromPoints(
			bone_lines[5],
			new Vector2(right_hip_P.X, right_hip_P.Y),
			new Vector2(right_foot_P.X, right_foot_P.Y),
		);
		updateLineFromPoints(
			bone_lines[6],
			new Vector2(neck_P.X, neck_P.Y),
			new Vector2(left_shoulder_P.X, left_shoulder_P.Y),
		);
		updateLineFromPoints(
			bone_lines[7],
			new Vector2(left_shoulder_P.X, left_shoulder_P.Y),
			new Vector2(left_hand_P.X, left_hand_P.Y),
		);
		updateLineFromPoints(bone_lines[8], new Vector2(waist_P.X, waist_P.Y), new Vector2(left_hip_P.X, left_hip_P.Y));
		updateLineFromPoints(
			bone_lines[9],
			new Vector2(left_hip_P.X, left_hip_P.Y),
			new Vector2(left_foot_P.X, left_foot_P.Y),
		);

		// Update Labels:
		container.Position = new UDim2(0, T_P.X, 0, T_P.Y - listlayout.AbsoluteContentSize.Y);

		const distance = math.floor(C_P.Z);
		const [health, maxHealth] = [humanoid.Health, humanoid.MaxHealth];
		data.Text = `[${distance}] [${health}/${maxHealth}] [${math.floor((health / maxHealth) * 100)}%]`;

		this.setVisible(true);
	}

	public destroy() {
		this.bin.destroy();
	}
}

/*
	---------------
	Event Listeners
	---------------
	All the event listeners that are used throughout the code.

*/
Workspace.GetPropertyChangedSignal("CurrentCamera").Connect(() => (CurrentCamera = Workspace.CurrentCamera!));

Players.PlayerAdded.Connect((player) => {
	player.CharacterAdded.Connect((character) => new ESP(character));
	if (player.Character) new ESP(player.Character);
});
for (const player of Players.GetPlayers()) {
	if (player === LocalPlayer) continue;
	player.CharacterAdded.Connect((character) => new ESP(character));
	if (player.Character) new ESP(player.Character);
}

const instances = ESP.instances;
RunService.RenderStepped.Connect(() => {
	for (const [_, instance] of instances) instance.render();
});

/*
	----------------------
	Initiation & Execution
	----------------------
	All the code that is executed on startup is placed here.

*/
ScreenGui.DisplayOrder = 10;
ScreenGui.IgnoreGuiInset = true;
ScreenGui.Parent = LocalPlayer.WaitForChild("PlayerGui")!;

export = 0;
